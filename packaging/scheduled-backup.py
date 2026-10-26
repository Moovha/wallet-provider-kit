#!/usr/bin/env python3
"""Configure and run encrypted, checksum-verified S3 backups on a single host."""

import argparse
import base64
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import uuid

sys.dont_write_bytecode = True
import recovery

MAX_S3_BYTES = 5_000_000_000
TOOL_DIRECTORY = Path("/usr/local/lib/wallet-provider-backup")
CONFIG_DIRECTORY = Path("/etc/wallet-provider-backup")
UNIT_DIRECTORY = Path("/etc/systemd/system")


def checked_path(value) -> Path:
    recovery.require(
        isinstance(value, str)
        and value.startswith("/")
        and not any(c in value for c in '\n\r\x00%$"\\'),
        "Use absolute backup paths without shell or systemd substitutions.",
    )
    path = Path(value)
    recovery.require(
        path.resolve() == path,
        "Backup paths cannot contain symbolic links or parent traversal.",
    )
    return path


def configuration(path: Path) -> dict:
    recovery.regular_file(path, private=True)
    value = recovery.read_json(path, 65536)
    allowed = {
        "configVersion",
        "enabled",
        "directory",
        "outputDirectory",
        "recipients",
        "resumeSource",
        "hostAdministrator",
        "localKeep",
        "schedule",
        "s3",
    }
    recovery.require(
        isinstance(value, dict)
        and not set(value) - allowed
        and value.get("configVersion") == 1,
        "Unsupported backup configuration.",
    )
    for key in ["enabled", "resumeSource", "hostAdministrator"]:
        recovery.require(
            type(value.get(key)) is bool,
            "Explicit backup activation and resumption settings are required.",
        )
    for key in ["directory", "outputDirectory", "recipients"]:
        checked_path(value[key])
    recovery.require(
        not checked_path(value["outputDirectory"]).is_relative_to(
            checked_path(value["directory"])
        )
        and not checked_path(value["recipients"]).is_relative_to(
            checked_path(value["directory"])
        ),
        "Backup output and public recipients must be outside the installation.",
    )
    recovery.require(
        type(value.get("localKeep")) is int and 0 <= value["localKeep"] <= 3660,
        "localKeep must be a snapshot count between zero and 3660; zero disables local pruning.",
    )
    calendar = value.get("schedule")
    recovery.require(
        isinstance(calendar, str)
        and 0 < len(calendar) <= 200
        and re.fullmatch(r"[A-Za-z0-9*,:./ _+\-=]+", calendar)
        and (
            calendar.endswith(" UTC")
            or re.search(r" [A-Za-z_+-]+(?:/[A-Za-z0-9_+-]+)+$", calendar)
        ),
        "Supply a valid single-line systemd calendar with an explicit timezone.",
    )
    s3 = value.get("s3")
    recovery.require(
        isinstance(s3, dict)
        and not set(s3)
        - {"bucket", "prefix", "region", "expectedOwner", "profile", "kmsKeyArn"},
        "Unsupported S3 backup configuration.",
    )
    recovery.require(
        isinstance(s3.get("bucket"), str)
        and re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", s3["bucket"]),
        "Use a standard S3 general purpose bucket name without dots.",
    )
    recovery.require(
        isinstance(s3.get("region"), str)
        and re.fullmatch(r"(af|ap|ca|eu|il|me|mx|sa|us)-[a-z]+-\d+", s3["region"]),
        "Select the bucket Region in the commercial AWS partition.",
    )
    recovery.require(
        isinstance(s3.get("expectedOwner"), str)
        and re.fullmatch(r"\d{12}", s3["expectedOwner"]),
        "Supply the independently verified twelve-digit bucket owner.",
    )
    recovery.require(
        isinstance(s3.get("prefix"), str)
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/_-]{0,200}", s3["prefix"])
        and not s3["prefix"].endswith("/")
        and "//" not in s3["prefix"],
        "Supply a nonempty S3 prefix without a leading or trailing slash.",
    )
    if s3.get("profile") is not None:
        recovery.require(
            isinstance(s3["profile"], str)
            and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", s3["profile"]),
            "Invalid AWS profile name.",
        )
    if s3.get("kmsKeyArn") is not None:
        recovery.require(
            isinstance(s3["kmsKeyArn"], str)
            and re.fullmatch(
                r"arn:aws:kms:"
                + re.escape(s3["region"])
                + r":\d{12}:key/[a-f0-9-]{36}",
                s3["kmsKeyArn"],
            ),
            "Use a KMS key ARN in the selected Region.",
        )
    return value


def aws(config: dict, operation: str, *args: str) -> dict:
    s3 = config["s3"]
    command = [
        "aws",
        "--no-cli-pager",
        "--no-cli-auto-prompt",
        "--region",
        s3["region"],
        "--endpoint-url",
        "https://s3." + s3["region"] + ".amazonaws.com",
        "--cli-connect-timeout",
        "10",
        "--cli-read-timeout",
        "120",
        "--output",
        "json",
    ]
    if s3.get("profile"):
        command += ["--profile", s3["profile"]]
    environment = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith("AWS_ENDPOINT_URL")
    }
    environment.update(
        {"AWS_PAGER": "", "AWS_CLI_AUTO_PROMPT": "off", "AWS_MAX_ATTEMPTS": "3"}
    )
    try:
        result = recovery.run(
            command + ["s3api", operation, *args],
            stdout=subprocess.PIPE,
            env=environment,
            timeout=1800,
        )
        return json.loads(result.stdout or b"{}")
    except (subprocess.SubprocessError, ValueError) as error:
        raise recovery.RecoveryError(
            "S3 backup operation failed. Check the private job configuration, AWS CLI version and scoped permissions."
        ) from None


def preflight(config: dict) -> None:
    recovery.require(
        config["enabled"], "Backup automation is disabled in its configuration."
    )
    recovery.require(
        shutil.which("age") and shutil.which("aws") and shutil.which("docker"),
        "Install age, AWS CLI v2 and Docker Compose before scheduling backups.",
    )
    capabilities = aws(config, "put-object", "--generate-cli-skeleton", "input")
    recovery.require(
        {"IfNoneMatch", "ChecksumSHA256"} <= set(capabilities),
        "Update AWS CLI v2 to a version supporting conditional uploads and SHA-256 checksums.",
    )
    s3 = config["s3"]
    bucket_args = [
        "--bucket",
        s3["bucket"],
        "--expected-bucket-owner",
        s3["expectedOwner"],
    ]
    location = (
        aws(config, "get-bucket-location", *bucket_args).get("LocationConstraint")
        or "us-east-1"
    )
    recovery.require(
        location == s3["region"],
        "The bucket Region differs from the selected backup Region.",
    )
    public = aws(config, "get-public-access-block", *bucket_args).get(
        "PublicAccessBlockConfiguration", {}
    )
    recovery.require(
        all(
            public.get(key) is True
            for key in [
                "BlockPublicAcls",
                "IgnorePublicAcls",
                "BlockPublicPolicy",
                "RestrictPublicBuckets",
            ]
        ),
        "Enable all S3 Block Public Access controls before scheduling backups.",
    )


def upload(config: dict, archive: Path, key: str) -> dict:
    recovery.require(
        archive.stat().st_size <= MAX_S3_BYTES,
        "This S3 uploader supports encrypted archives up to 5,000,000,000 bytes; retain larger archives for a separately reviewed multipart upload.",
    )
    fingerprint = recovery.digest(archive)
    checksum = base64.b64encode(bytes.fromhex(fingerprint)).decode()
    s3 = config["s3"]
    args = [
        "--bucket",
        s3["bucket"],
        "--key",
        key,
        "--expected-bucket-owner",
        s3["expectedOwner"],
    ]
    encryption = ["--server-side-encryption", "AES256"]
    if s3.get("kmsKeyArn"):
        encryption = [
            "--server-side-encryption",
            "aws:kms",
            "--ssekms-key-id",
            s3["kmsKeyArn"],
        ]
    response = aws(
        config,
        "put-object",
        *args,
        "--body",
        str(archive),
        "--if-none-match",
        "*",
        "--checksum-algorithm",
        "SHA256",
        "--checksum-sha256",
        checksum,
        *encryption,
    )
    head_args = [*args, "--checksum-mode", "ENABLED"]
    if response.get("VersionId"):
        head_args += ["--version-id", response["VersionId"]]
    observed = aws(config, "head-object", *head_args)
    recovery.require(
        observed.get("ContentLength") == archive.stat().st_size
        and observed.get("ChecksumSHA256") == checksum
        and observed.get("ServerSideEncryption") == encryption[1]
        and (not s3.get("kmsKeyArn") or observed.get("SSEKMSKeyId") == s3["kmsKeyArn"])
        and recovery.digest(archive) == fingerprint,
        "Uploaded backup verification failed. Keep the local encrypted archive for operator review.",
    )
    return {
        "sha256": fingerprint,
        "bytes": observed["ContentLength"],
        "key": key,
        "bucket": s3["bucket"],
        "versionId": response.get("VersionId"),
        "verified": True,
    }


def atomic_json(path: Path, value: dict) -> None:
    with tempfile.NamedTemporaryFile(
        dir=path.parent, prefix=".backup-status-", delete=False
    ) as output:
        temporary = Path(output.name)
        try:
            output.write((json.dumps(value, indent=2) + "\n").encode())
            output.flush()
            os.fsync(output.fileno())
            os.replace(temporary, path)
            recovery.sync_directory(path.parent)
        finally:
            temporary.unlink(missing_ok=True)


def prune(config: dict, directory: Path) -> None:
    if config["localKeep"] == 0:
        return
    receipts = []
    for path in directory.glob("backup-*.receipt.json"):
        if not re.fullmatch(
            r"backup-\d{8}T\d{6}Z-[a-f0-9]{32}\.receipt\.json", path.name
        ):
            continue
        recovery.regular_file(path, private=True)
        record = recovery.read_json(path, 65536)
        if (
            record.get("verified") is True
            and record.get("sourceDirectory") == config["directory"]
            and record.get("bucket") == config["s3"]["bucket"]
            and record.get("key", "").startswith(config["s3"]["prefix"] + "/")
        ):
            receipts.append((path, record))
    for path, record in sorted(receipts, key=lambda row: row[0].name, reverse=True)[
        config["localKeep"] :
    ]:
        archive = path.with_name(path.name.removesuffix(".receipt.json") + ".age")
        if archive.exists():
            recovery.regular_file(archive, private=True)
            recovery.require(
                recovery.digest(archive) == record["sha256"],
                "Local retention refused an altered archive.",
            )
            archive.unlink()
        path.unlink()
    recovery.sync_directory(directory)


def run_backup(config: dict) -> None:
    root, directory = checked_path(config["directory"]), checked_path(
        config["outputDirectory"]
    )
    recovery.private_directory(root, config["hostAdministrator"])
    recovery.private_directory(directory, config["hostAdministrator"])
    lock = os.open(
        directory / ".scheduled-backup.lock",
        os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,
        0o600,
    )
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        status_path = directory / "backup-status.json"
        previous = (
            recovery.read_json(status_path, 65536) if status_path.exists() else {}
        )
        status = {
            "state": "running",
            "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "lastSuccessAt": previous.get("lastSuccessAt"),
            "phase": "preflight",
        }
        atomic_json(status_path, status)
        try:
            preflight(config)
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime(
                "%Y%m%dT%H%M%SZ"
            )
            name = "backup-" + stamp + "-" + uuid.uuid4().hex
            archive = directory / (name + ".age")
            status["phase"] = "snapshot"
            atomic_json(status_path, status)
            recovery.backup(
                root,
                archive,
                checked_path(config["recipients"]),
                config["hostAdministrator"],
                config["resumeSource"],
            )
            status["phase"] = "upload"
            atomic_json(status_path, status)
            receipt = upload(
                config, archive, config["s3"]["prefix"] + "/" + archive.name
            )
            receipt["createdAt"] = stamp
            receipt["sourceDirectory"] = config["directory"]
            atomic_json(directory / (name + ".receipt.json"), receipt)
            status.update(
                {
                    "phase": "retention",
                    "lastSuccessAt": datetime.datetime.now(
                        datetime.timezone.utc
                    ).isoformat(),
                    "receipt": receipt,
                }
            )
            atomic_json(status_path, status)
            prune(config, directory)
            status.update(
                {
                    "state": "succeeded",
                    "phase": "complete",
                    "lastSuccessAt": datetime.datetime.now(
                        datetime.timezone.utc
                    ).isoformat(),
                    "receipt": receipt,
                }
            )
            atomic_json(status_path, status)
            print("Encrypted backup uploaded and verified. Local retention completed.")
        except BaseException:
            status["state"] = "failed"
            atomic_json(status_path, status)
            raise
    finally:
        os.close(lock)


def units(config: dict) -> tuple[str, str]:
    user = "root"
    service = f"""[Unit]
Description=Encrypted wallet provider backup to S3
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User={user}
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths="{config['directory']}" "{config['outputDirectory']}"
ExecStart=/usr/bin/python3 {TOOL_DIRECTORY}/scheduled-backup.py run --config {CONFIG_DIRECTORY}/config.json
TimeoutStartSec=45min
"""
    timer = f"""[Unit]
Description=Schedule encrypted wallet provider backups

[Timer]
OnCalendar={config['schedule']}
Persistent=false
RandomizedDelaySec=0
Unit=wallet-provider-backup.service

[Install]
WantedBy=timers.target
"""
    return service, timer


def install(config: dict, replace: bool) -> None:
    recovery.require(
        os.getuid() == 0, "Installing the system timer requires the host administrator."
    )
    recovery.require(
        config["enabled"] and config["resumeSource"] and config["hostAdministrator"],
        "The system installer requires enabled=true, resumeSource=true and hostAdministrator=true.",
    )
    # The administrator copies reviewed inputs into root-owned locations before enabling a root job.
    recovery.run(
        ["systemd-analyze", "calendar", config["schedule"]], stdout=subprocess.DEVNULL
    )
    paths = [
        UNIT_DIRECTORY / "wallet-provider-backup.service",
        UNIT_DIRECTORY / "wallet-provider-backup.timer",
        CONFIG_DIRECTORY / "config.json",
    ]
    recovery.require(
        replace or not any(p.exists() for p in paths),
        "A backup timer already exists; review it and use --replace for an explicit update.",
    )
    if replace:
        recovery.run(
            ["systemctl", "stop", "wallet-provider-backup.timer"],
            stdout=subprocess.DEVNULL,
        )
        active = subprocess.run(
            ["systemctl", "is-active", "wallet-provider-backup.service"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        recovery.require(
            active.stdout.strip() in (b"inactive", b"failed", b"unknown"),
            "A backup is active. Leave its timer stopped and wait for the original job before replacing tools.",
        )
    for directory in [TOOL_DIRECTORY, CONFIG_DIRECTORY]:
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        recovery.private_directory(directory)
    for name in ["recovery.py", "scheduled-backup.py"]:
        source = Path(__file__).resolve().parent / name
        target = TOOL_DIRECTORY / name
        with tempfile.NamedTemporaryFile(dir=TOOL_DIRECTORY, delete=False) as output:
            temporary = Path(output.name)
            output.write(source.read_bytes())
            output.flush()
            os.fsync(output.fileno())
        temporary.chmod(0o600)
        os.replace(temporary, target)
    atomic_json(CONFIG_DIRECTORY / "config.json", config)
    service, timer = units(config)
    for path, content in zip(paths[:2], [service, timer]):
        recovery.require(
            not path.is_symlink(), "Backup unit paths cannot be symbolic links."
        )
        path.write_text(content)
        path.chmod(0o644)
    recovery.run(["systemctl", "daemon-reload"], stdout=subprocess.DEVNULL)
    recovery.run(
        ["systemctl", "enable", "--now", "wallet-provider-backup.timer"],
        stdout=subprocess.DEVNULL,
    )
    print(
        "Backup timer installed. Run the service once and inspect its status before relying on the schedule."
    )


def main() -> None:
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "run", "install", "status"])
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    config = configuration(args.config)
    if args.command == "validate":
        print(
            "Backup configuration valid. No service was stopped or cloud storage contacted."
        )
    elif args.command == "run":
        run_backup(config)
    elif args.command == "install":
        install(config, args.replace)
    else:
        status = recovery.read_json(
            checked_path(config["outputDirectory"]) / "backup-status.json"
        )
        print(
            json.dumps(
                {
                    key: status.get(key)
                    for key in ["state", "phase", "startedAt", "lastSuccessAt"]
                }
            )
        )


if __name__ == "__main__":
    try:
        main()
    except recovery.RecoveryError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print(
            "Scheduled backup failed. Inspect the private status file and original service health. Local encrypted archives are retained.",
            file=sys.stderr,
        )
        sys.exit(1)
