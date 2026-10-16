# Write for the public reader

Use this guide before every commit and push to Wallet Provider Kit. Public text
includes documentation, walkthroughs, examples, UI messages, code comments,
generated descriptions, changelog entries, commit messages and PR titles/bodies.
Choose language for the reader's task and the artifact's purpose. Assume the
reader has no access to the development chat, local workspace or earlier decisions.

## Choose the reader and purpose

| Artifact                                  | Reader and purpose                               | Include                                                                                       |
| ----------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| README and getting started                | A team evaluating or installing the toolkit      | What it does, supported scope, prerequisites and the first useful step.                       |
| Walkthrough or operator runbook           | An operator carrying out a task                  | Starting state, commands or UI actions, expected results, failure handling and the next step. |
| API, architecture or security guide       | A developer integrating or reviewing the service | Contracts, responsibility boundaries, exact behavior and limits.                              |
| Contributor or release workflow           | A contributor maintaining the public project     | Repository rules, required checks and review/publication steps.                               |
| Commit summary, changelog or release note | Someone understanding a change later             | The affected feature, concrete change, compatibility impact and relevant limits.              |
| PR title and description                  | A reviewer assessing the proposed change         | The problem, resulting behavior, scope, verification and unresolved limitations.              |
| UI text, example or code comment          | An operator or developer using the feature       | What the action or code does, prerequisites and consequences where relevant.                  |

Contributor instructions belong in contributor workflows. Operator walkthroughs
should explain how to use the service, rather than direct a coding agent or
describe the maintainer's next development session.

## Make the text self-contained

Address the operator or integrating developer as **you** when giving instructions.
Name the responsible system when describing behavior: the provider service,
connected application, wallet backend or account owner. Define specialist terms
on first use or link to the relevant concept. Keep API field names and commands exact.

Use direct verbs and concrete subjects. Explain a feature through its present
behavior; reserve before/after descriptions for commits, PRs and change records.
Maintainers may use **we** for a clear project commitment, such as responding to
security reports. Pronoun replacement alone is not an audience review.

| Development-context wording                                                          | Public wording for the stated purpose                                                                           |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Walkthrough: "Publish the reviewed implementation and this runbook before starting." | "Use a reviewed toolkit revision and the matching walkthrough for your staging deployment."                     |
| Operator guide: "Use a build/package containing this change."                        | "Use a toolkit build that supports `http.documentation`."                                                       |
| Commit: "docs: update our walkthrough after the latest pass"                         | "docs: clarify staging deployment prerequisites and expected results"                                           |
| PR: "As discussed, this finishes the next part."                                     | "Operators can enable the API explorer in exported configuration and open it on their provider's HTTPS origin." |

Remove chat references, personal reminders, local machine paths, owner-specific
permissions and session progress from adopter guidance. Put private operational
records in the operator's records. Put change-specific verification in the PR or
CI artifacts. A public evidence summary should explain what was tested, its
method and limits, and what the reader may conclude; exclude credential discovery
and session narration. Preserve historical commit messages and evidence facts;
correct future wording without rewriting published history.

## Preserve technical meaning

Keep prerequisites, denial behavior, recovery rules and custody responsibilities
explicit. Distinguish supported service behavior, offline fixtures, limited live
evidence and pending deployment acceptance. Do not turn a language edit into a
claim of production readiness, provider certification, gas sponsorship or settlement.
Use the [security model](security-model.md) and [provider guide](provider-guide.md)
to check those boundaries.

For generated references, edit the owning source descriptions, regenerate and
review the output. Preserve legal notices, external quotations and exact
protocol identifiers; review surrounding explanations for clarity.

## Review before publication

Perform this review for each change, including code-only changes with public
comments, UI text or commit/PR wording:

1. Identify the intended reader and task for each changed artifact using the
   table above. Read the surrounding section as well as the changed lines.
2. Check that a new reader can understand who acts, what they need, what happens
   and what to do next without the chat or development history. Rewrite wording
   that depends on "this change", "our latest pass" or an unstated prior decision.
3. Check commands, UI labels, links, terminology and capability/evidence claims
   against the implementation and owning guides. Review generated output too.
4. Before committing, inspect the staged diff and proposed commit message. Before
   pushing, inspect every outgoing commit message and public-text change, and
   prepare or review the final PR title/body. Repeat for each later push.
5. Complete the PR's audience/purpose checklist and state the readers and purpose
   of the changed text. Run the [required repository checks](../CONTRIBUTING.md#development)
   and review rendered documentation before publication.

This is a required editorial review. Prettier, link checks, tests and generated
reference checks support it, but cannot establish that prose suits its reader.
