# Vista Platform License

Version 1.0, 29 October 2026.
Licensor: LakeShore Labs LLC, a Florida limited liability company doing
business as Vista Security ("we", "us").
SPDX identifier: `LicenseRef-Vista-Platform-License-1.0`.

This licence is a legal agreement between you and us about the Vista Platform
software. By installing or using a release of Vista Platform that this licence
is published with, you accept it. If you do not agree to it, do not install or
use that release.

## 1. What this licence covers

1.1. This licence governs each release of Vista Platform that it is published
with: the platform's container images (including the database `schema` image),
its Helm chart, its web and administration consoles, and the documentation and
install files published with that release, in every edition.

1.2. It does not govern:

(a) the Vista Platform sensor, the device interrogation agent and any other
program published in the Agents repository
(<https://github.com/VistaSecurity/VistaPlatform-Agents>), which are licensed
under the Apache License 2.0 in that repository, including when a platform
release refers to them or downloads them;

(b) any third-party component included in a release (section 9); or

(c) any release published before this licence version (section 9.3).

## 2. Definitions

"**You**" means the organization that installs or uses a release, or, if there
is no such organization, the individual who does. "**Your**" has the matching
meaning.

"**Affiliate**" means any entity that controls, is controlled by, or is under
common control with you, where control means owning more than fifty per cent
of the voting interests, or the power to direct the management and policies, of
an entity.

"**Internal Business Use**" means use by you and your Affiliates, and by people
acting for you or them, for your own and your Affiliates' business operations,
including commercial operations, in respect of systems, networks and assets
that you or your Affiliates own, operate or are authorized to assess.

"**Authorized Administrator**" means a person you permit to administer your
Installation on your behalf, whether or not that person is your employee
(section 6).

"**Installation**" means a deployment of a release that you control, together
with the data it holds.

"**Core**" means the capabilities of Vista Platform that are available without
an edition licence token. "**Enterprise**" and "**MSP**" mean the capabilities
that require one (section 4).

"**Release**" means a version of Vista Platform as published by us, identified
by its version number and the digests of its images and chart.

## 3. Core: free for Internal Business Use

3.1. Core is free of charge. Subject to this licence, we grant you a
non-exclusive, non-transferable, worldwide licence to install, run, copy and
configure Core for Internal Business Use, on any number of instances,
clusters, nodes, tenants, sensors, agents, assets and users.

3.2. This licence imposes no capacity cap, expiry, activation, registration,
licence key or connection to us for Core. Core does not send telemetry to us
unless you turn it on.

3.3. The rights in 3.1 extend to your Affiliates automatically. If an entity
stops being your Affiliate, it may keep using an Installation it was already
using for up to ninety days after that, after which it needs its own licence
(which, for Core, it obtains simply by accepting this licence).

## 4. Enterprise and MSP: separate agreement

4.1. Enterprise and MSP capabilities are licensed only under a separate written
agreement with us (an order form or subscription agreement that incorporates
this licence and an edition schedule). That agreement governs the edition,
term, limits, fees, support and any warranty for those capabilities; where it
conflicts with this licence, it prevails for them.

4.2. The signed edition licence token that the product installs records the
edition and expiry the agreement grants. It is a record of the grant, not the
grant itself. Without an agreement, or after its expiry, an Installation runs
as Core under this licence; it is not terminated.

## 5. Permitted operations

5.1. For every edition, and without any additional licence, count or fee, you
may:

(a) make backups of an Installation and restore them;

(b) mirror the images and the chart into your own registries, provided that
you do not alter them, or re-sign them and present them as published by us
(your own additional signing for your internal policy is permitted);

(c) run disaster-recovery and standby instances; a standby that serves no
production traffic does not count as an additional instance for any edition
limit;

(d) transfer releases into air-gapped or otherwise disconnected environments
by any means;

(e) deploy with automation of your choice, including CI/CD pipelines, GitOps
and infrastructure-as-code tooling; and

(f) run non-production instances for testing, staging and evaluation.

5.2. You may modify your configuration, the chart's values, and your own
database extensions and integrations that use the product's documented
interfaces.

## 6. Delegated administration

6.1. You may let Authorized Administrators, including consultants, contractors
and managed-service providers, administer your Installation on your behalf,
including from their own premises and with their own tooling. They act under
your licence, and you are responsible for what they do.

6.2. This licence does not restrict Authorized Administrators by employer,
e-mail domain or location, and the product contains no mechanism that blocks or
detects them. The product's ordinary access control and audit logging apply to
them as to anyone else.

6.3. Administering your Installation is not operating a hosted service under
section 7. The test under section 7 is whose Installation it is and whose data
it holds, not who logs in. For clarity: a consultant who runs a separate,
dedicated Installation for exactly one customer, with that customer as the
licensee, is administering that customer's Installation; a consultant who runs
one Installation holding several customers' data is operating a service that
requires an MSP agreement; a parent company running one Installation for itself
and its Affiliates is within section 3.

## 7. What you may not do

Unless a separate written agreement with us permits it, you may not:

(a) operate Vista Platform to provide inventory, discovery, posture or similar
services to third parties, other than your Affiliates, from an Installation you
control, where those third parties' data is held in it;

(b) offer Vista Platform to third parties as a hosted, managed or shared
service;

(c) sublicense, sell, rent, lease, lend or otherwise distribute a release, or
any part of one, to third parties, except that you may give a release to your
Authorized Administrators and Affiliates for the purposes of this licence;

(d) reverse engineer, decompile or disassemble the images or other compiled
parts of a release, or modify or create derivative works of them, except to the
extent that applicable law allows this despite a contractual prohibition (for
example for interoperability), and then only to that extent. This does not
restrict what section 5.2 permits, nor your reading of any script, stylesheet,
SQL, API or other material that a release necessarily exposes to run;

(e) remove or obscure any licence, notice, trademark or attribution in a
release; or

(f) use a release in breach of any law that applies to you, including laws on
accessing computer systems and networks. You are responsible for using the
product only against systems you own or are authorized to assess.

## 8. No source code, no open-source promise

8.1. This licence grants no right to the platform's source code.

8.2. We make no promise that any release governed by this licence will be
published as source code or converted to an open-source licence. Nothing in
this licence is or implies such a promise.

## 9. Third-party components and earlier releases

9.1. Each release includes third-party components under their own licences,
which are listed in the third-party notices file shipped inside each image and
with the release. Those licences govern those components, and nothing in this
licence restricts the rights they give you. Where a third-party licence
requires source availability or other obligations, its terms govern that
component.

9.2. Our Vista Platform sensor and device interrogation agent remain under the
Apache License 2.0 (section 1.2(a)).

9.3. Releases published before this licence version keep the licence they were
published with. In particular, releases of Vista Platform Core published as
source under the Functional Source License, Version 1.1, ALv2 Future License
(FSL-1.1-ALv2) keep those terms, including each such release's conversion to the
Apache License 2.0 on the date that licence sets. This licence does not change,
relabel or revoke those terms.

## 10. Updates and support

10.1. Core comes with no support obligation and no service level. Our current
practice for security fixes is described in the Distribution repository's
security policy; it is a description of practice, not a promise.

10.2. You may install any update or security fix we publish for an edition you
are licensed for, under the licence version published with that update.
Installing a release moves the whole Installation onto that release's licence
version.

10.3. We publish security advisories for the platform through the Distribution
repository (<https://github.com/VistaSecurity/VistaPlatform-Distribution>).

10.4. Free use of Core is not a promise of future releases.

## 11. Feedback

If you give us suggestions, comments or other feedback about the product, we
may use them freely, without obligation to you.

## 12. Trademarks

This licence grants no rights in our names, logos or trademarks, including
"Vista Platform" and "Vista Security", except the right to refer to the product
by its name to identify it accurately.

## 13. Export control

A release contains cryptographic software and may be subject to export,
re-export and import controls. You are responsible for complying with the
controls that apply to you.

## 14. Termination

14.1. Your licence ends automatically if you materially breach it and do not
cure the breach within thirty days after we notify you of it.

14.2. On termination you must stop using the releases and delete your copies,
except copies the law requires you to keep.

14.3. Sections 8, 9, 11, 12, 13, 15, 16, 17 and 19 survive termination.

14.4. Nothing in this licence lets us terminate the Core licence of a user who
is in compliance with it for convenience.

## 15. Warranty disclaimer

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING ANY WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE, TITLE AND NON-INFRINGEMENT, TO THE FULLEST EXTENT THE LAW ALLOWS. We
do not warrant that the software will meet your requirements, operate without
interruption, be error-free, or find every asset, certificate or weakness in
your environment. Any warranty for a paid edition is set out in the separate
agreement for it, not here.

## 16. Limitation of liability

16.1. TO THE FULLEST EXTENT THE LAW ALLOWS, WE ARE NOT LIABLE FOR ANY INDIRECT,
INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA,
PROFITS, REVENUE, BUSINESS OR GOODWILL, ARISING OUT OF OR RELATING TO THIS
LICENCE OR THE SOFTWARE, HOWEVER CAUSED AND UNDER ANY THEORY OF LIABILITY.

16.2. OUR TOTAL LIABILITY ARISING OUT OF OR RELATING TO THIS LICENCE OR CORE
IS LIMITED TO ONE UNITED STATES DOLLAR (US$1.00). For a paid edition, the cap
is set in the separate agreement for it.

16.3. These limits do not apply to liability for fraud or wilful misconduct, or
to any liability that the applicable law does not allow to be limited or
excluded.

## 17. Governing law and venue

This licence is governed by the laws of the State of Florida, United States of
America, without regard to its conflict-of-laws rules. The state and federal
courts located in Lake County, Florida have exclusive jurisdiction over any
dispute arising out of or relating to this licence, and each party submits to
their jurisdiction. The United Nations Convention on Contracts for the
International Sale of Goods does not apply.

## 18. Versions, acceptance and your own users

18.1. Each version of this licence has a version number and a date. The text of
the version that applies to a release is published with that release (in each
image under `/usr/share/doc/vista/LICENSE.md`, and in the Distribution
repository, which also records the SHA-256 of the text).

18.2. A licence version applies only to the releases it is published with. It
does not change the terms of any earlier release.

18.3. You accept this licence by installing or using a release. No acceptance
step requires a connection to us.

18.4. This licence is between you and us. It is not the terms of service,
acceptable-use policy or privacy policy between you and the people who use
your Installation. Those documents are yours: the product ships editable
templates for them, we are not a party to them, and we do not process your
Installation's data.

## 19. General

19.1. This licence, together with any separate agreement under section 4, is
the entire agreement between you and us about the releases it covers, and
replaces any earlier understanding about them.

19.2. If a provision of this licence is held unenforceable, it is to be
enforced to the maximum extent permitted and the rest remains in effect.

19.3. A failure to enforce a provision is not a waiver of it.

19.4. You may not assign or transfer this licence except to an Affiliate or to
a successor to all or substantially all of the business to which it relates,
and the assignee must accept it. We may assign it to a successor to the Vista
Platform business.

19.5. Section headings are for convenience only. "Including" means "including
without limitation".

Copyright 2026 LakeShore Labs LLC (d/b/a Vista Security). All rights reserved.
