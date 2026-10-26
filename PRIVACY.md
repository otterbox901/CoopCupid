# CoopCupid Privacy Policy

_Effective October 25, 2026_

CoopCupid is a Chrome extension that ranks WaterlooWorks jobs against your
résumé, saves jobs to a WaterlooWorks folder, and can submit applications for
you. It is built to keep your data on your own device. This policy explains
what it handles and where that data goes.

## The short version

- Your résumé and matching data are stored **only in your browser**.
- CoopCupid talks **only to WaterlooWorks**, using your own signed-in session.
- There are **no CoopCupid servers, accounts, analytics, ads, or AI services**.
- Nothing is sold or shared with anyone.

## What CoopCupid stores on your device

Stored in the extension's local browser storage (IndexedDB):

- **Your résumé:** the PDF you choose, its file name, and the text extracted
  from it, including any corrections you make.
- **Your preferences:** completed co-op terms, the interview score cutoff, and
  whether automatic saving is on.
- **Search results:** job postings read from your last WaterlooWorks search
  (titles, employers, locations, descriptions, application requirements) and
  their scores.
- **Application records:** the outcome of your last application batch, and a
  temporary marker for a submission that was interrupted, so CoopCupid can warn
  you to check it.

Résumé parsing and job ranking happen entirely on your device.

## What is sent, and to whom

CoopCupid sends data **only to WaterlooWorks** (`waterlooworks.uwaterloo.ca`),
from your browser, in the session you are already signed into:

- **Searching** reads job postings and your folder list from WaterlooWorks.
- **Saving** creates a `coopcupid` folder and adds or removes jobs in it.
- **Applying** uploads your résumé PDF to WaterlooWorks and submits applications
  you confirmed. Once uploaded, those documents and applications are held by
  WaterlooWorks under the University of Waterloo's own policies.

CoopCupid never sends your data to its developer or any other third party.
It never reads or stores your WaterlooWorks password.

## Permissions

- **Access to `waterlooworks.uwaterloo.ca`:** to read your search and act on
  your behalf on that site only. CoopCupid does not run on any other website.
- **`activeTab` and `scripting`:** to work with the WaterlooWorks tab you have
  open.
- **`sidePanel`:** to show CoopCupid beside the page.

## Keeping and deleting your data

Your data stays in your browser until you remove it. **Clear local data** in
the side panel deletes everything CoopCupid stored. Removing the extension
from Chrome deletes it too. Documents and applications already sent to
WaterlooWorks stay in WaterlooWorks; manage them there.

## The CoopCupid website

The CoopCupid landing page uses no cookies, analytics, or tracking scripts.

## Changes and contact

If this policy changes, the new version will be posted here with a new
effective date. Questions or concerns: open an issue at
<https://github.com/otterbox901/coopmatch/issues>.
