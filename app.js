const originalInventory = [
  ['S779', [3,4,6,4,3]], ['CF56', [3,4,6,4,3]], ['W5033', [3,4,6,4,3]],
  ['CK06', [3,4,6,4,3]], ['6-561', [3,4,6,4,3]], ['G231', [3,4,6,4,3]],
  ['AD027', [3,4,6,4,3]], ['XB15', [3,4,6,4,3]], ['W35', [3,4,6,4,3]], ['W5860', [3,4,6,4,3]]
];
const stored = localStorage.getItem('shoe-stock-inventory');
let inventory = stored ? JSON.parse(stored) : originalInventory;
let images = JSON.parse(localStorage.getItem('shoe-stock-images') || '{}');
let editMode = false;
const sizes = [40, 41, 42, 43, 44];
const table = document.querySelector('#inventory-table');
const search = document.querySelector('#search');

function save() { localStorage.setItem('shoe-stock-inventory', JSON.stringify(inventory)); }
function saveImages() { localStorage.setItem('shoe-stock-images', JSON.stringify(images)); }
function render() {
  const term = search.value.trim().toLowerCase();
  const visible = inventory.filter(([code]) => code.toLowerCase().includes(term));
  table.innerHTML = visible.map(([code, quantities], row) => {
    const realRow = inventory.findIndex(([item]) => item === code);
    const cells = quantities.map((quantity, col) => editMode ? `<td><span class="quantity"><button type="button" data-row="${realRow}" data-col="${col}" data-change="-1" aria-label="Remove one ${code} size ${sizes[col]}">−</button><output>${quantity}</output><button type="button" data-row="${realRow}" data-col="${col}" data-change="1" aria-label="Add one ${code} size ${sizes[col]}">+</button></span></td>` : `<td>${quantity}</td>`).join('');
    const image = images[code] ? `<img src="${images[code]}" alt="${code} shoe" />` : 'PHOTO';
    const options = sizes.map((size, col) => `<option value="${col}" ${quantities[col] === 0 ? 'disabled' : ''}>${size} (${quantities[col]})</option>`).join('');
    const soldOut = quantities.every((quantity) => quantity === 0);
    return `<tr><td><div class="shoe-cell"><span class="shoe-image">${image}</span><span>${code}</span>${editMode ? `<button class="image-button" type="button" data-image-code="${code}">Add image</button>` : ''}</div></td>${cells}<td>${quantities.reduce((a,b) => a+b, 0)}</td><td><div class="checkout-control"><select data-checkout-size="${realRow}" aria-label="Size for ${code}">${options}</select><button class="checkout-button" type="button" data-checkout-row="${realRow}" ${soldOut ? 'disabled' : ''}>Checkout</button></div></td></tr>`;
  }).join('');
  document.querySelector('#search-result').textContent = `Showing ${visible.length} design${visible.length === 1 ? '' : 's'}`;
  const all = inventory.flatMap(([, q]) => q);
  document.querySelector('#total-pairs').textContent = all.reduce((a,b) => a+b, 0);
  document.querySelector('#total-designs').textContent = inventory.length;
  const totals = sizes.map((_, i) => inventory.reduce((sum, [,q]) => sum + q[i], 0));
  document.querySelector('#top-size').textContent = sizes[totals.indexOf(Math.max(...totals))];
}
table.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.imageCode) { chooseImage(button.dataset.imageCode); return; } if (button.dataset.checkoutRow !== undefined) { const row = Number(button.dataset.checkoutRow); const picker = table.querySelector(`[data-checkout-size="${row}"]`); const col = Number(picker.value); if (inventory[row][1][col] > 0) { inventory[row][1][col] -= 1; save(); render(); } return; } if (button.dataset.row !== undefined && editMode) { const {row,col,change} = button.dataset; inventory[row][1][col] = Math.max(0, inventory[row][1][col] + Number(change)); save(); render(); } });
function chooseImage(code) { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.addEventListener('change', () => { const file = input.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => compressImage(reader.result).then((image) => { images[code] = image; try { saveImages(); render(); } catch { alert('This photo is too large. Please choose a smaller image.'); } }); reader.readAsDataURL(file); }); input.click(); }
function compressImage(source) { return new Promise((resolve) => { const image = new Image(); image.onload = () => { const scale = Math.min(1, 640 / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', .75)); }; image.src = source; }); }
search.addEventListener('input', render);
document.querySelector('#reset-button').addEventListener('click', () => { inventory = structuredClone(originalInventory); save(); render(); });
document.querySelector('#edit-button').addEventListener('click', () => { editMode = !editMode; document.querySelector('#edit-button').textContent = editMode ? 'Done editing' : 'Edit inventory'; render(); });
render();
