# Privacy Notice

Last updated: 2026-08-02

PrivOS Demo MCP App is a stateless reference application operated by PrivOS AI.
It accesses workspace data only when a user invokes its tools or interface and
only through the PrivOS scopes approved during installation.

## Data handled

Depending on the requested workflow, the app can process workspace identity,
lists, files, AI chat content, and sandbox-control requests. The exact requested
permissions and their purposes are documented in [SCOPES.md](SCOPES.md).

The app has no persistent volume and does not create an independent customer
database. Records, files, and AI conversations remain in the user's PrivOS
workspace services. A local browser preference stores only the selected visual
theme. The app includes no advertising, behavioral analytics, or third-party
tracking SDK.

## Retention and sharing

The app does not retain workspace content after an individual request beyond
the active process memory needed to return the response. PrivOS platform logs,
workspace storage, backups, and account records remain governed by the user's
PrivOS agreement and workspace settings. The app does not sell personal data or
share workspace content with an independent third party.

## User choices and contact

Workspace administrators control installation, approved scopes, and removal of
the app. Users should use their PrivOS account controls for access, correction,
export, or deletion requests. Privacy and security questions can be sent to
`dev@privos.ai`.

Material changes to this notice will be published in this repository and, when
applicable, submitted as a new Marketplace version for review.
