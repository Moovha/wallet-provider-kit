#!/usr/bin/env python3
"""Host-only, stopped-writer recovery for a self-contained release installation."""

import argparse
import contextlib
import datetime
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import tarfile
import tempfile
import time

FORMAT = "wallet-provider-recovery-1"
MANIFEST = "recovery-manifest.json"
REPORTS = {MANIFEST, "recovery-status.json", "recovery-originals.json"}
MAX_BYTES = 64 * 1024**3
MAX_FILES = 100000
MAX_MANIFEST = 32 * 1024**2


class RecoveryError(Exception):
    """An error safe to display without installation data."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RecoveryError(message)


def private_directory(path: Path, host_administrator: bool = False) -> Path:
    info = path.lstat()
    require(
        stat.S_ISDIR(info.st_mode)
        and not info.st_mode & 0o077
        and (info.st_uid == os.getuid() or (host_administrator and os.getuid() == 0)),
        "Use a private directory owned by the current service operator.",
    )
    require(
        path.is_absolute() and path.resolve() == path,
        "Use an absolute directory without symbolic links.",
    )
    return path


def regular_file(path: Path, private: bool = False) -> None:
    info = path.lstat()
    require(
        stat.S_ISREG(info.st_mode) and info.st_nlink == 1,
        "Symbolic links, hard links and special files are unsupported.",
    )
    if private:
        require(
            info.st_uid == os.getuid() and not info.st_mode & 0o077,
            "Recovery identities must be private files owned by the operator.",
        )


def relative_path(value: str) -> str:
    require(
        isinstance(value, str)
        and 0 < len(value) <= 4096
        and "\\" not in value
        and not any(ord(c) < 32 for c in value),
        "Invalid recovery path.",
    )
    path = PurePosixPath(value)
    require(
        not path.is_absolute()
        and all(p not in ("", ".", "..") for p in value.split("/")),
        "Recovery paths must stay inside the installation.",
    )
    return value


def read_json(path: Path, limit: int = MAX_MANIFEST):
    require(path.stat().st_size <= limit, "Recovery metadata exceeds its size limit.")
    return json.loads(path.read_text())


def digest(path: Path) -> str:
    regular_file(path)
    h = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path: Path, value, exclusive: bool = True) -> None:
    with os.fdopen(
        os.open(
            path,
            os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC),
            0o600,
        ),
        "w",
    ) as output:
        json.dump(value, output, indent=2)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())


def sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def run(args: list[str], **kwargs) -> subprocess.CompletedProcess:
    # Subprocess diagnostics can include private paths, credentials and identifiers.
    return subprocess.run(args, check=True, stderr=subprocess.DEVNULL, **kwargs)


def compose_command(root: Path, *args: str) -> list[str]:
    return [
        "docker",
        "compose",
        "--env-file",
        "/dev/null",
        "--file",
        str(root / "compose.json"),
        "--profile",
        "*",
        *args,
    ]


def inspect_layout(root: Path, source_root: Path | None = None) -> dict:
    source_root = source_root or root
    config = read_json(root / "provider.config.json", 65536)
    compose = read_json(root / "compose.json")
    require(
        config["backend"]["kind"] == "ows" and config["storage"]["kind"] == "sqlite",
        "Recovery supports the OWS and SQLite release profile only.",
    )
    required = [
        "provider.config.json",
        "provider.env",
        "compose.json",
        relative_path(config["storage"]["directory"]),
        relative_path(config["backend"]["vaultDirectory"]),
    ]
    require(
        config.get("configVersion") == 1, "Unsupported provider configuration version."
    )
    for network in [config, *config.get("additionalNetworks", [])]:
        if network.get("safeWallet"):
            required.append(relative_path(network["safeWallet"]["runtimeDirectory"]))
    services = compose["services"]
    require(
        "api" in services and isinstance(services, dict),
        "Provider Compose is incomplete.",
    )
    require(
        not compose.get("include")
        and not compose.get("extends")
        and not compose.get("volumes")
        and not compose.get("configs")
        and not compose.get("secrets"),
        "External Compose storage is unsupported.",
    )
    images = {}
    for name, service in services.items():
        image = service.get("image", "")
        require(
            re.fullmatch(r"[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}", image)
            and not service.get("build")
            and not service.get("extends")
            and not service.get("env_file")
            and not service.get("devices")
            and not service.get("volumes_from")
            and not service.get("configs")
            and not service.get("secrets")
            and not service.get("develop"),
            "Use immutable release images and self-contained Compose storage.",
        )
        images[name] = image
        for volume in service.get("volumes", []):
            require(
                isinstance(volume, dict) and volume.get("type") == "bind",
                "Only installation-local bind mounts are supported.",
            )
            source = Path(volume["source"].replace("$$", "$"))
            require(
                source.is_absolute()
                and source.is_relative_to(source_root)
                and source != source_root,
                "All Compose bind mounts must be inside the installation.",
            )
            relative = relative_path(source.relative_to(source_root).as_posix())
            require(
                (root / relative).resolve() == root / relative,
                "Recovery bind mounts cannot contain symbolic links.",
            )
            required.append(relative)
    for name in set(required):
        require(
            name.split("/")[0] not in REPORTS,
            "Recovery reports cannot be used as runtime storage.",
        )
        require((root / name).exists(), "A required recovery component is missing.")
    # Secret references must be retained, rather than supplied only by a login shell.
    env = (root / "provider.env").read_text()
    references = set()

    def visit(value):
        if isinstance(value, dict):
            if set(value) == {"env"}:
                references.add(value["env"])
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(config)
    for name in references:
        require(
            isinstance(name, str)
            and re.fullmatch(r"[A-Z][A-Z0-9_]{0,127}", name)
            and re.search(r"^" + re.escape(name) + r"=.+$", env, re.MULTILINE),
            "Retain every configured secret reference in provider.env before backup.",
        )
    database = root / config["storage"]["directory"] / "provider.sqlite"
    regular_file(database)
    with contextlib.closing(
        sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
    ) as db:
        require(
            db.execute("PRAGMA application_id").fetchone()[0] == 0x57504B54
            and db.execute("PRAGMA user_version").fetchone()[0] == 2,
            "Unsupported provider database identity or schema.",
        )
        require(
            db.execute("PRAGMA quick_check").fetchall() == [("ok",)]
            and not db.execute("PRAGMA foreign_key_check").fetchall(),
            "Provider database integrity checks failed.",
        )
        catalog = db.execute(
            "SELECT name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
    return {
        "required": sorted(set(required)),
        "images": images,
        "schemaVersion": 2,
        "catalogSHA256": hashlib.sha256(json.dumps(catalog).encode()).hexdigest(),
        "originalDirectory": str(source_root),
    }


def unreadable_directory(_error: OSError) -> None:
    raise RecoveryError(
        "An installation directory is unreadable; backup cannot omit inaccessible storage."
    )


def inventory(root: Path) -> dict:
    entries = {}
    total = 0
    for folder, dirs, files in os.walk(
        root, followlinks=False, onerror=unreadable_directory
    ):
        for name in sorted(dirs + files):
            path = Path(folder) / name
            rel = relative_path(path.relative_to(root).as_posix())
            info = path.lstat()
            if rel in REPORTS:
                regular_file(path)
                continue
            require(
                stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode),
                "Symbolic links and special files cannot be backed up.",
            )
            if stat.S_ISREG(info.st_mode):
                require(
                    info.st_nlink == 1,
                    "Hard-linked installation files are unsupported.",
                )
                total += info.st_size
                require(
                    total <= MAX_BYTES, "Installation exceeds the recovery size limit."
                )
                entries[rel] = {
                    "type": "file",
                    "size": info.st_size,
                    "sha256": digest(path),
                    "executable": bool(info.st_mode & 0o100),
                }
            else:
                entries[rel] = {"type": "directory"}
            require(
                len(entries) <= MAX_FILES,
                "Installation exceeds the recovery file limit.",
            )
    return dict(sorted(entries.items()))


def require_local_docker() -> None:
    endpoint = os.environ.get("DOCKER_HOST")
    if not endpoint:
        endpoint = json.loads(
            run(
                [
                    "docker",
                    "context",
                    "inspect",
                    "--format",
                    "{{json .Endpoints.docker.Host}}",
                ],
                stdout=subprocess.PIPE,
            ).stdout
        )
    require(
        isinstance(endpoint, str) and endpoint.startswith("unix://"),
        "Backups require a local Unix-socket Docker context.",
    )


def container_states(root: Path) -> list[dict]:
    raw = run(
        compose_command(root, "ps", "--all", "--format", "json"), stdout=subprocess.PIPE
    ).stdout.strip()
    try:
        states = json.loads(raw or b"[]")
    except json.JSONDecodeError:
        states = [json.loads(line) for line in raw.splitlines()]
    if isinstance(states, dict):
        states = [states]
    require(isinstance(states, list), "Container state is unavailable.")
    return states


class SourceResumption:
    """Resume only the unchanged source writer, never a recovered installation."""

    def __init__(self, root: Path):
        require(
            not (root / "recovery-status.json").exists(),
            "Recovered installations require manual reconciliation before scheduling.",
        )
        self.root = root
        self.identity = (root.stat().st_dev, root.stat().st_ino)
        self.files = {
            name: digest(root / name)
            for name in ["provider.config.json", "provider.env", "compose.json"]
        }
        self.states = container_states(root)
        self.running = [s for s in self.states if s.get("State") == "running"]
        require(
            any(s.get("Service") == "api" for s in self.running),
            "Scheduled backups require the original API to be running.",
        )
        require(
            all(
                s.get("ID")
                and s.get("Service")
                and s.get("Health", "") in ("", "healthy")
                for s in self.running
            ),
            "Source containers must have stable identities and passing health checks.",
        )
        self.stopping = False

    def resume(self) -> None:
        require(
            self.identity == (self.root.stat().st_dev, self.root.stat().st_ino)
            and all(
                digest(self.root / name) == value for name, value in self.files.items()
            ),
            "Source configuration or credentials changed. Leave writers stopped for operator review.",
        )
        require(
            {s.get("ID") for s in container_states(self.root)}
            == {s.get("ID") for s in self.states},
            "Source containers changed. Automatic resumption is refused.",
        )
        run(
            compose_command(
                self.root, "start", *sorted({s["Service"] for s in self.running})
            ),
            stdout=subprocess.DEVNULL,
        )
        expected = {s["ID"]: s for s in self.running}
        for _ in range(120):
            observed = {s.get("ID"): s for s in container_states(self.root)}
            if all(
                observed.get(key, {}).get("State") == "running"
                and (
                    not original.get("Health")
                    or observed[key].get("Health") == "healthy"
                )
                for key, original in expected.items()
            ):
                print("Original source services resumed.")
                return
            time.sleep(1)
        raise RecoveryError(
            "Source health did not recover. Inspect the original services; do not start a restored copy."
        )


def backup(
    root: Path,
    output: Path,
    recipients: Path,
    host_administrator: bool = False,
    resume_source: bool = False,
) -> None:
    require(
        not host_administrator or os.getuid() == 0,
        "Host-administrator backups require an explicit privileged invocation.",
    )
    require_local_docker()
    private_directory(root, host_administrator)
    private_directory(output.parent, host_administrator)
    regular_file(recipients)
    require(
        output.is_absolute()
        and not output.exists()
        and not output.is_symlink()
        and not output.is_relative_to(root)
        and not recipients.resolve().is_relative_to(root),
        "Use a new backup outside the installation and keep recipients separately.",
    )
    recipient_lines = [
        s.strip()
        for s in recipients.read_text().splitlines()
        if s.strip() and not s.lstrip().startswith("#")
    ]
    require(
        recipient_lines
        and all(re.fullmatch(r"age1[0-9a-z]{58}", s) for s in recipient_lines),
        "Supply native age X25519 public recipients, one per line.",
    )
    # Validate recipients before stopping the provider.
    run(
        ["age", "--encrypt", "--recipients-file", str(recipients)],
        input=b"",
        stdout=subprocess.DEVNULL,
    )
    lock = os.open(root, os.O_RDONLY)
    resumption = None
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        inspect_layout(root)
        inventory(root)
        if resume_source:
            resumption = SourceResumption(root)
            resumption.stopping = True
        run(compose_command(root, "stop"), stdout=subprocess.DEVNULL)
        states = container_states(root)
        require(
            isinstance(states, list)
            and all(s.get("State") in ("exited", "created", "dead") for s in states),
            "Provider containers are still active; backup refused.",
        )
        layout = inspect_layout(root)
        entries = inventory(root)
        manifest = {
            "format": FORMAT,
            "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            **layout,
            "entries": entries,
        }
        metadata = json.dumps(manifest).encode()
        require(
            len(metadata) <= MAX_MANIFEST, "Recovery manifest exceeds its size limit."
        )
        with tempfile.NamedTemporaryFile(
            dir=output.parent, prefix=".wpk-encrypted-", delete=False
        ) as encrypted:
            temporary = Path(encrypted.name)
            try:
                process = subprocess.Popen(
                    ["age", "--encrypt", "--recipients-file", str(recipients)],
                    stdin=subprocess.PIPE,
                    stdout=encrypted,
                    stderr=subprocess.DEVNULL,
                )
                try:
                    with tarfile.open(
                        fileobj=process.stdin, mode="w|gz", format=tarfile.USTAR_FORMAT
                    ) as archive:
                        for name in entries:
                            archive.add(root / name, arcname=name, recursive=False)
                        member = tarfile.TarInfo(MANIFEST)
                        member.size, member.mode = len(metadata), 0o600
                        archive.addfile(member, io.BytesIO(metadata))
                    process.stdin.close()
                    require(process.wait() == 0, "Backup encryption failed.")
                finally:
                    if process.poll() is None:
                        process.kill()
                    process.wait()
                require(
                    entries == inventory(root) and layout == inspect_layout(root),
                    "Installation changed during backup; keep all writers stopped and retry.",
                )
                encrypted.flush()
                os.fsync(encrypted.fileno())
                os.link(temporary, output)
                sync_directory(output.parent)
            finally:
                temporary.unlink(missing_ok=True)
        print(
            "Encrypted recovery snapshot created."
            if resume_source
            else "Encrypted backup created. The source remains stopped. Retain an off-site copy and test recovery before relying on it."
        )
    finally:
        try:
            if resumption and resumption.stopping:
                resumption.resume()
        finally:
            os.close(lock)


def unpack(archive_path: Path, target: Path) -> dict:
    with tarfile.open(archive_path, "r:gz") as archive:
        members = {}
        total = 0
        for member in archive:
            name = relative_path(member.name)
            require(
                name not in members
                and (member.isfile() or member.isdir())
                and not member.issparse(),
                "Unsafe or duplicate archive entry.",
            )
            total += member.size
            require(
                total <= MAX_BYTES and len(members) < MAX_FILES + 1,
                "Recovery archive exceeds its size or file limit.",
            )
            members[name] = member
        require(
            MANIFEST in members
            and members[MANIFEST].isfile()
            and members[MANIFEST].size <= MAX_MANIFEST,
            "Recovery manifest is missing or too large.",
        )
        manifest = json.load(archive.extractfile(members[MANIFEST]))
        require(
            manifest.get("format") == FORMAT
            and isinstance(manifest.get("entries"), dict),
            "Unsupported recovery archive format.",
        )
        entries = manifest["entries"]
        require(
            set(members) == set(entries) | {MANIFEST},
            "Recovery inventory does not match the archive.",
        )
        for name, entry in entries.items():
            member = members[name]
            require(
                (entry.get("type") == "directory" and member.isdir())
                or (
                    entry.get("type") == "file"
                    and member.isfile()
                    and member.size == entry.get("size")
                ),
                "Recovery entry type or size differs from its manifest.",
            )
            for parent in PurePosixPath(name).parents:
                if str(parent) != ".":
                    require(
                        entries.get(str(parent), {}).get("type") == "directory",
                        "Recovery archive has an invalid parent directory.",
                    )
        # Copy file bytes explicitly; never apply archive links, ownership or permissions.
        for name, entry in sorted(
            entries.items(), key=lambda x: (x[0].count("/"), x[0])
        ):
            path = target / name
            if entry["type"] == "directory":
                path.mkdir(mode=0o700)
            else:
                with archive.extractfile(members[name]) as source, path.open(
                    "xb"
                ) as output:
                    shutil.copyfileobj(source, output)
                    output.flush()
                    os.fsync(output.fileno())
                path.chmod(0o700 if entry.get("executable") else 0o600)
                require(
                    digest(path) == entry.get("sha256"),
                    "Recovery file checksum mismatch.",
                )
    layout = inspect_layout_for_restore(target, manifest)
    require(
        layout == {key: manifest[key] for key in layout},
        "Recovery layout differs from its manifest.",
    )
    return manifest


def inspect_layout_for_restore(target: Path, manifest: dict) -> dict:
    original = Path(manifest["originalDirectory"])
    require(original.is_absolute(), "Recovery source directory is invalid.")
    return inspect_layout(target, original)


def restore_or_verify(archive: Path, identity: Path, destination: Path | None) -> None:
    regular_file(archive)
    regular_file(identity, private=True)
    require(
        archive.is_absolute() and identity.is_absolute(),
        "Use absolute archive and identity paths.",
    )
    if destination is not None:
        require(
            destination.is_absolute()
            and not destination.exists()
            and not destination.is_symlink(),
            "Restore requires a new absolute destination; existing installations are never overwritten.",
        )
        parent = private_directory(destination.parent)
    else:
        parent = private_directory(identity.parent)
    with tempfile.TemporaryDirectory(dir=parent, prefix=".wpk-recovery-") as temporary:
        working = Path(temporary)
        decrypted = working / "archive.tgz"
        # Fully authenticate the encrypted stream before inspecting or extracting its contents.
        with decrypted.open("xb") as output:
            process = subprocess.Popen(
                ["age", "--decrypt", "--identity", str(identity), str(archive)],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
            try:
                total = 0
                while True:
                    block = process.stdout.read(1024 * 1024)
                    if not block:
                        break
                    total += len(block)
                    require(
                        total <= MAX_BYTES, "Decrypted archive exceeds its size limit."
                    )
                    output.write(block)
                require(
                    process.wait() == 0,
                    "Archive authentication failed or recovery identity is incorrect.",
                )
            finally:
                process.stdout.close()
                if process.poll() is None:
                    process.kill()
                process.wait()
        target = working / "installation"
        target.mkdir(mode=0o700)
        manifest = unpack(decrypted, target)
        if destination is not None:
            config = read_json(target / "provider.config.json")
            original_config = json.loads(json.dumps(config))
            original_compose = read_json(target / "compose.json")
            for service in original_compose["services"].values():
                for volume in service.get("volumes", []):
                    source = Path(volume["source"].replace("$$", "$"))
                    volume["source"] = str(
                        destination / source.relative_to(manifest["originalDirectory"])
                    ).replace("$", "$$")
            write_json(
                target / "recovery-originals.json",
                {"configuration": original_config, "compose": original_compose},
            )
            config["activation"] = {"enabled": False}
            for network in config.get("additionalNetworks", []):
                network["activation"] = {"enabled": False}
            write_json(target / "provider.config.json", config, exclusive=False)
            compose = read_json(target / "compose.json")
            for service in compose["services"].values():
                for volume in service.get("volumes", []):
                    source = Path(volume["source"].replace("$$", "$"))
                    volume["source"] = str(
                        destination / source.relative_to(manifest["originalDirectory"])
                    ).replace("$", "$$")
                service.update(
                    {
                        "entrypoint": ["/bin/false"],
                        "command": [],
                        "restart": "no",
                        "network_mode": "none",
                    }
                )
                for key in ["ports", "networks", "depends_on", "healthcheck"]:
                    service.pop(key, None)
            compose["name"] = "wallet-provider-recovery-" + os.urandom(6).hex()
            compose.pop("networks", None)
            write_json(target / "compose.json", compose, exclusive=False)
            write_json(target / MANIFEST, manifest)
            write_json(
                target / "recovery-status.json",
                {
                    "format": FORMAT,
                    "execution": "disabled",
                    "chainReconciliation": "required",
                    "originalWriterFencing": "required",
                    "archiveSHA256": digest(archive),
                    "signerRecovery": "not_verified",
                },
            )
            # mkdir reserves the destination exclusively, including against a concurrent restore.
            for folder, _, _ in os.walk(target, topdown=False):
                sync_directory(Path(folder))
            destination.mkdir(mode=0o700)
            try:
                os.replace(target, destination)
                sync_directory(parent)
            except BaseException:
                # Preserve a partial destination for inspection; never mark it ready or start it.
                raise RecoveryError(
                    "Restore interrupted. Retain the incomplete destination for private inspection."
                )
            print(
                "Recovery set restored with execution disabled and containers fenced. Verify signer bindings and reconcile chain outcomes before resuming service."
            )
        else:
            print(
                "Archive authentication, inventory and SQLite integrity verified. Signer decryption and chain reconciliation still require a recovery drill."
            )


def main() -> None:
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("backup")
    create.add_argument("output", type=Path)
    create.add_argument(
        "--directory",
        type=Path,
        default=Path(
            os.environ.get("WPK_DIRECTORY", str(Path.home() / ".wallet-provider"))
        ),
    )
    create.add_argument("--recipients", type=Path, required=True)
    create.add_argument(
        "--host-administrator",
        action="store_true",
        help="Allow an explicitly privileged backup of private service-owned directories without changing ownership.",
    )
    for command in ["restore", "verify"]:
        sub = commands.add_parser(command)
        sub.add_argument("archive", type=Path)
        sub.add_argument("--identity", type=Path, required=True)
        if command == "restore":
            sub.add_argument("destination", type=Path)
    args = parser.parse_args()
    require(shutil.which("age"), "Install age before running recovery tools.")
    if args.command == "backup":
        require(
            shutil.which("docker"),
            "Docker Compose is required for stopped-writer backups.",
        )
        backup(args.directory, args.output, args.recipients, args.host_administrator)
    else:
        restore_or_verify(
            args.archive, args.identity, getattr(args, "destination", None)
        )


if __name__ == "__main__":
    try:
        main()
    except RecoveryError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except PermissionError:
        print(
            "Recovery storage is not readable by this operator. Use the service owner, or an explicitly privileged backup with --host-administrator; do not broaden custody-file permissions.",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception:
        print(
            "Recovery operation failed. Retain the source and inspect private storage, tool availability and compatibility. No service was started.",
            file=sys.stderr,
        )
        sys.exit(1)
