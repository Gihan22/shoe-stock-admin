import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updatePassword } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit, runTransaction, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAxPWU1sdQ6yIA6wFgz7PWg6V7CKMualk8',
  authDomain: 'shoe-stock-gihan.firebaseapp.com',
  projectId: 'shoe-stock-gihan',
  storageBucket: 'shoe-stock-gihan.firebasestorage.app',
  messagingSenderId: '994044704410',
  appId: '1:994044704410:web:be5a3b7b2f23638b405123'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const stockRef = doc(db, 'inventory', 'current');
const salesCollection = collection(db, 'sales');
const originalInventory = [
  ['S779', [3,4,6,4,3]], ['CF56', [3,4,6,4,3]], ['W5033', [3,4,6,4,3]],
  ['CK06', [3,4,6,4,3]], ['6-561', [3,4,6,4,3]], ['G231', [3,4,6,4,3]],
  ['AD027', [3,4,6,4,3]], ['XB15', [3,4,6,4,3]], ['W35', [3,4,6,4,3]], ['W5860', [3,4,6,4,3]]
];
const sizes = [40, 41, 42, 43, 44];
let inventory = [];
let images = JSON.parse(localStorage.getItem('shoe-stock-images') || '{}');
let editMode = false;
let stopListening = null;
let stopSalesListening = null;
let pendingCheckout = null;

const loginScreen = document.querySelector('#login-screen');
const inventoryScreen = document.querySelector('#inventory-screen');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const table = document.querySelector('#inventory-table');
const search = document.querySelector('#search');
const signedInAs = document.querySelector('#signed-in-as');
const addShoeForm = document.querySelector('#add-shoe-form');
const checkoutDialog = document.querySelector('#checkout-dialog');
const checkoutForm = document.querySelector('#checkout-form');
const checkoutSize = document.querySelector('#checkout-size');
const paymentMethod = document.querySelector('#payment-method');
const salesList = document.querySelector('#sales-list');

function cloneInventory(items = originalInventory) { return items.map(([code, quantities, price = 0]) => [code, [...quantities], Number(price) || 0]); }
function toStoredItems(items) { return items.map(([code, quantities, price = 0]) => ({ code, quantities: [...quantities], price: Number(price) || 0 })); }
function fromStoredItems(items) { return items.map((item) => Array.isArray(item) ? [item[0], [...item[1]], Number(item[2]) || 0] : [item.code, [...item.quantities], Number(item.price) || 0]); }
function saveImages() { localStorage.setItem('shoe-stock-images', JSON.stringify(images)); }
function setLoginMessage(message, success = false) { loginMessage.textContent = message; loginMessage.classList.toggle('success', success); }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]); }
function formatPrice(price) { return `Rs. ${Number(price || 0).toFixed(2)}`; }

function render() {
  const term = search.value.trim().toLowerCase();
  const visible = inventory.filter(([code]) => code.toLowerCase().includes(term));
  table.innerHTML = visible.map(([code, quantities, price = 0]) => {
    const row = inventory.findIndex(([item]) => item === code);
    const safeCode = escapeHTML(code);
    const cells = quantities.map((quantity, col) => editMode
      ? `<td><span class="quantity"><button type="button" data-row="${row}" data-col="${col}" data-change="-1" aria-label="Remove one ${code} size ${sizes[col]}">−</button><output>${quantity}</output><button type="button" data-row="${row}" data-col="${col}" data-change="1" aria-label="Add one ${code} size ${sizes[col]}">+</button></span></td>`
      : `<td>${quantity}</td>`).join('');
    const image = images[code] ? `<img src="${images[code]}" alt="${safeCode} shoe" />` : 'PHOTO';
    const options = sizes.map((size, col) => `<option value="${col}" ${quantities[col] === 0 ? 'disabled' : ''}>${size} (${quantities[col]})</option>`).join('');
    const soldOut = quantities.every((quantity) => quantity === 0);
    const codeControl = editMode ? `<input class="code-input" data-code-input="${row}" value="${safeCode}" aria-label="Shoe code" /><button class="image-button" type="button" data-save-design-row="${row}">Save</button><button class="delete-button" type="button" data-delete-row="${row}">Delete</button><button class="image-button" type="button" data-image-code="${safeCode}">Add image</button>` : `<span>${safeCode}</span>`;
    const priceCell = editMode ? `<td><input class="price-input" data-price-input="${row}" type="number" min="0" step="0.01" value="${Number(price) || 0}" aria-label="Price for ${safeCode}" /></td>` : `<td class="price-cell">${formatPrice(price)}</td>`;
    return `<tr><td><div class="shoe-cell"><span class="shoe-image">${image}</span>${codeControl}</div></td>${cells}${priceCell}<td>${quantities.reduce((a,b) => a + b, 0)}</td><td><div class="checkout-control"><select data-checkout-size="${row}" aria-label="Size for ${safeCode}">${options}</select><button class="checkout-button" type="button" data-checkout-row="${row}" ${soldOut ? 'disabled' : ''}>Checkout</button></div></td></tr>`;
  }).join('');
  document.querySelector('#search-result').textContent = `Showing ${visible.length} design${visible.length === 1 ? '' : 's'}`;
  const all = inventory.flatMap(([, quantities]) => quantities);
  document.querySelector('#total-pairs').textContent = all.reduce((sum, quantity) => sum + quantity, 0);
  document.querySelector('#total-designs').textContent = inventory.length;
  const totals = sizes.map((_, index) => inventory.reduce((sum, [, quantities]) => sum + quantities[index], 0));
  document.querySelector('#top-size').textContent = sizes[totals.indexOf(Math.max(...totals))];
}

async function ensureInventory(snapshot) {
  if (snapshot.exists()) {
    inventory = fromStoredItems(snapshot.data().items);
    render();
    return;
  }
  await setDoc(stockRef, { items: toStoredItems(cloneInventory()), updatedAt: serverTimestamp() });
}

async function changeQuantity(row, col, change) {
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(stockRef);
      const next = snapshot.exists() ? fromStoredItems(snapshot.data().items) : cloneInventory();
      next[row][1][col] = Math.max(0, next[row][1][col] + change);
      transaction.set(stockRef, { items: toStoredItems(next), updatedAt: serverTimestamp() });
    });
  } catch (error) {
    document.querySelector('#search-result').textContent = `Could not save: ${error.message}`;
  }
}

async function saveShoeDesign(row, nextCode, nextPrice) {
  const code = nextCode.trim().toUpperCase();
  const price = Number(nextPrice);
  if (!code || !Number.isFinite(price) || price < 0) {
    document.querySelector('#search-result').textContent = 'Enter a shoe code and a valid price.';
    return;
  }
  const previousCode = inventory[row]?.[0];
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(stockRef);
      const next = snapshot.exists() ? fromStoredItems(snapshot.data().items) : cloneInventory();
      if (next.some(([itemCode], index) => index !== row && itemCode.toLowerCase() === code.toLowerCase())) throw new Error('That shoe code already exists.');
      next[row][0] = code;
      next[row][2] = price;
      transaction.set(stockRef, { items: toStoredItems(next), updatedAt: serverTimestamp() });
    });
    if (previousCode && images[previousCode]) {
      images[code] = images[previousCode];
      delete images[previousCode];
      saveImages();
    }
  } catch (error) {
    document.querySelector('#search-result').textContent = error.message || 'Could not rename this shoe code.';
  }
}

async function addShoe(code, quantities, price) {
  const normalizedCode = code.trim().toUpperCase();
  const numericPrice = Number(price);
  if (!normalizedCode || quantities.some((quantity) => !Number.isInteger(quantity) || quantity < 0) || !Number.isFinite(numericPrice) || numericPrice < 0) {
    document.querySelector('#search-result').textContent = 'Enter a shoe code, a valid price, and zero or more pairs for every size.';
    return;
  }
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(stockRef);
      const next = snapshot.exists() ? fromStoredItems(snapshot.data().items) : cloneInventory();
      if (next.some(([itemCode]) => itemCode.toLowerCase() === normalizedCode.toLowerCase())) throw new Error('That shoe code already exists.');
      next.push([normalizedCode, quantities, numericPrice]);
      transaction.set(stockRef, { items: toStoredItems(next), updatedAt: serverTimestamp() });
    });
    addShoeForm.reset();
  } catch (error) {
    document.querySelector('#search-result').textContent = error.message || 'Could not add this shoe design.';
  }
}

async function deleteShoe(row) {
  const code = inventory[row]?.[0];
  if (!code || !confirm(`Remove ${code} from the inventory? This cannot be undone.`)) return;
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(stockRef);
      const next = snapshot.exists() ? fromStoredItems(snapshot.data().items) : cloneInventory();
      next.splice(row, 1);
      transaction.set(stockRef, { items: toStoredItems(next), updatedAt: serverTimestamp() });
    });
    if (images[code]) { delete images[code]; saveImages(); }
  } catch (error) {
    document.querySelector('#search-result').textContent = error.message || 'Could not remove this shoe design.';
  }
}

function openCheckout(row, sizeIndex) {
  const [code, quantities, price = 0] = inventory[row];
  pendingCheckout = { row, sizeIndex };
  document.querySelector('#checkout-code').textContent = code;
  checkoutSize.innerHTML = sizes.map((size, index) => `<option value="${index}" ${index === sizeIndex ? 'selected' : ''} ${quantities[index] === 0 ? 'disabled' : ''}>Size ${size} (${quantities[index]} available)</option>`).join('');
  document.querySelector('#checkout-price').textContent = formatPrice(price);
  document.querySelector('#checkout-message').textContent = '';
  paymentMethod.value = 'COD';
  checkoutDialog.showModal();
}

async function completeCheckout() {
  if (!pendingCheckout) return;
  const { row } = pendingCheckout;
  const sizeIndex = Number(checkoutSize.value);
  const method = paymentMethod.value;
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(stockRef);
      const next = snapshot.exists() ? fromStoredItems(snapshot.data().items) : cloneInventory();
      if (!next[row] || next[row][1][sizeIndex] < 1) throw new Error('That size is no longer available.');
      const [code, quantities, price = 0] = next[row];
      quantities[sizeIndex] -= 1;
      transaction.set(stockRef, { items: toStoredItems(next), updatedAt: serverTimestamp() });
      transaction.set(doc(salesCollection), { shoeCode: code, size: sizes[sizeIndex], price: Number(price) || 0, paymentMethod: method, createdAt: serverTimestamp() });
    });
    document.querySelector('#search-result').textContent = 'Checkout saved successfully.';
    pendingCheckout = null;
    checkoutDialog.close();
  } catch (error) {
    document.querySelector('#checkout-message').textContent = error.message || 'Could not save this checkout.';
  }
}

function renderSales(snapshot) {
  if (snapshot.empty) { salesList.innerHTML = '<li>No checkouts recorded yet.</li>'; return; }
  salesList.innerHTML = snapshot.docs.map((sale) => {
    const data = sale.data();
    return `<li><strong>${escapeHTML(data.shoeCode)}</strong> · Size ${data.size} · ${formatPrice(data.price)} <span>${escapeHTML(data.paymentMethod)}</span></li>`;
  }).join('');
}

function chooseImage(code) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => compressImage(reader.result).then((image) => {
      images[code] = image;
      try { saveImages(); render(); } catch { alert('This photo is too large. Please choose a smaller image.'); }
    });
    reader.readAsDataURL(file);
  });
  input.click();
}

function compressImage(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 640 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', .75));
    };
    image.src = source;
  });
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button');
  button.disabled = true;
  setLoginMessage('Signing in…', true);
  try {
    await signInWithEmailAndPassword(auth, document.querySelector('#email').value.trim(), document.querySelector('#password').value);
  } catch (error) {
    const message = error.code === 'auth/invalid-credential' ? 'Email or password is not correct.' : 'Could not sign in. Please try again.';
    setLoginMessage(message);
  } finally { button.disabled = false; }
});

table.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.saveDesignRow !== undefined) {
    const row = Number(button.dataset.saveDesignRow);
    saveShoeDesign(row, table.querySelector(`[data-code-input="${row}"]`).value, table.querySelector(`[data-price-input="${row}"]`).value);
    return;
  }
  if (button.dataset.deleteRow !== undefined) {
    deleteShoe(Number(button.dataset.deleteRow));
    return;
  }
  if (button.dataset.imageCode) { chooseImage(button.dataset.imageCode); return; }
  if (button.dataset.checkoutRow !== undefined) {
    const row = Number(button.dataset.checkoutRow);
    const picker = table.querySelector(`[data-checkout-size="${row}"]`);
    openCheckout(row, Number(picker.value));
    return;
  }
  if (button.dataset.row !== undefined && editMode) changeQuantity(Number(button.dataset.row), Number(button.dataset.col), Number(button.dataset.change));
});

search.addEventListener('input', render);
addShoeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const quantities = sizes.map((size) => Number(document.querySelector(`#new-size-${size}`).value));
  addShoe(document.querySelector('#new-shoe-code').value, quantities, document.querySelector('#new-shoe-price').value);
});
checkoutForm.addEventListener('submit', (event) => { event.preventDefault(); completeCheckout(); });
document.querySelector('#cancel-checkout-button').addEventListener('click', () => checkoutDialog.close());
document.querySelector('#close-checkout-button').addEventListener('click', () => checkoutDialog.close());
document.querySelector('#reset-button').addEventListener('click', () => {
  if (confirm('Reset every shoe quantity to the first shipment numbers?')) setDoc(stockRef, { items: toStoredItems(cloneInventory()), updatedAt: serverTimestamp() });
});
document.querySelector('#edit-button').addEventListener('click', () => {
  editMode = !editMode;
  document.querySelector('#edit-button').textContent = editMode ? 'Done editing' : 'Edit inventory';
  addShoeForm.hidden = !editMode;
  render();
});
document.querySelector('#sign-out-button').addEventListener('click', () => signOut(auth));
document.querySelector('#change-password-button').addEventListener('click', async () => {
  const newPassword = prompt('Enter a new password (at least 8 characters).');
  if (newPassword === null) return;
  if (newPassword.length < 8) { alert('Please use at least 8 characters.'); return; }
  const confirmation = prompt('Enter the new password again.');
  if (newPassword !== confirmation) { alert('The passwords do not match.'); return; }
  try {
    await updatePassword(auth.currentUser, newPassword);
    alert('Your password has been changed.');
  } catch {
    alert('Please sign out, sign in again, and then retry changing your password.');
  }
});
document.querySelector('#reset-password-button').addEventListener('click', async () => {
  const email = document.querySelector('#email').value.trim();
  if (!email) { setLoginMessage('Enter your email address first.'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    setLoginMessage('Password reset email sent. Check your inbox.', true);
  } catch {
    setLoginMessage('Could not send a reset email. Check the address and try again.');
  }
});

onAuthStateChanged(auth, (user) => {
  if (stopListening) { stopListening(); stopListening = null; }
  if (stopSalesListening) { stopSalesListening(); stopSalesListening = null; }
  if (!user) {
    loginScreen.hidden = false;
    inventoryScreen.hidden = true;
    addShoeForm.hidden = true;
    inventory = [];
    return;
  }
  loginScreen.hidden = true;
  inventoryScreen.hidden = false;
  signedInAs.textContent = user.email || 'Signed in';
  stopListening = onSnapshot(stockRef, ensureInventory, (error) => {
    document.querySelector('#search-result').textContent = `Inventory access is not ready: ${error.message}`;
  });
  stopSalesListening = onSnapshot(query(salesCollection, orderBy('createdAt', 'desc'), limit(8)), renderSales, () => { salesList.innerHTML = '<li>Could not load checkout history.</li>'; });
});

