# Avelon Edge — free plan operation

The production site is https://gihan22.github.io/shoe-stock-admin/.
It uses GitHub Pages and the existing Firebase Spark project `shoe-stock-gihan`.
Billing was confirmed disabled during this update. No paid services were enabled.

## Daily use

- Edit inventory to add shoes, rename codes, change selling prices in LKR, adjust sizes, or add a photo.
- Archive removes a shoe from sale while keeping stock and photo. Select Archived designs to restore it.
- Checkout requires a saved positive price. Choose size, quantity, COD or Bank transfer, and Pending or Paid.
- Mark paid only when payment has been received. Older orders with no status show Unknown.
- A checkout saves stock and the order in one transaction. A fixed order ID prevents a repeated submission of the same open checkout from creating two orders.
- Stock updates use stable item IDs, so a partner renaming or archiving a different design will not change the target.
- Customer/reference and notes are optional. Photos are compressed thumbnails, not original files.
- A connection and successful database response are required before a save is reported as complete.

## Photos and existing data

Existing inventory and sales are read without resetting them. Existing shoe IDs are generated deterministically from their old code and retained on the next stock write.
Photos are separate documents in `photos/{itemId}` capped by the app at 60,000 characters each.
The old browser-local photos are kept. On the browser where they were originally added, use **Share photos from this browser** to copy them to the shared database. The button appears only when local photos are found.

## Backups

Download backup exports inventory (including archived items), all sales and all shared photos as JSON.
Sales CSV includes all sales, while the screen displays only the latest 50 to bound routine reads.
These are manual exports; scheduled backups and one-click restore are not enabled.
For recovery, preserve the JSON and ask an administrator to inspect it and restore carefully.
An export reads collections sequentially in pages and is not a database-wide point-in-time snapshot; export when your partner is not editing for a consistent business snapshot.

## Capacity and cost

This compact inventory supports up to 500 designs including archives in one inventory document.
The app does not use Cloud Storage, Cloud Functions or scheduled paid backups.
Firestore's documented free allowance is 1 GiB stored data, 50,000 document reads/day,
20,000 writes/day, 20,000 deletes/day and 10 GiB outbound transfer/month.
These are service quotas, not a guarantee of unlimited free use. Photo downloads and full exports count toward usage.
Monitor usage in Firebase Console. On Spark, reaching a limit can interrupt requests; billing must be explicitly enabled to use paid capacity.

Sources:
- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

## Access and maintenance

The existing Firestore rules restrict access to the two approved email accounts.
The browser Firebase API key is public configuration, not an admin credential.
Do not put passwords, service-account keys or CLI tokens into the repository.
Both users should refresh after deployment so older open app versions do not write the previous schema.
The retired app.js is retained for history; index.html loads app-v2.js.

Validation:
- `node --test tests/inventory-model.test.mjs`
- `node tests/browser-check.cjs` (uses the local bundled Playwright runtime and isolated mock data)
- Browser checks never write sample orders into the production database.
