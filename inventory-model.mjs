export const SIZES = [40, 41, 42, 43, 44];
export const MAX_DESIGNS = 500;
export function normalizeItems(items = []) {
  if (!Array.isArray(items)) throw new Error('Inventory format is invalid. Download a backup before making changes.');
  return items.map(raw => {
    const item = Array.isArray(raw) ? {code:raw[0], quantities:raw[1], price:raw[2] || 0} : raw;
    if (typeof item.code !== 'string' || !Array.isArray(item.quantities) || item.quantities.length !== 5 ||
        item.quantities.some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('Invalid inventory quantities. Please contact the administrator.');
    return {...item, id:item.id || `legacy-${encodeURIComponent(item.code)}`, price:Number(item.price) || 0, archived:!!item.archived, quantities:[...item.quantities]};
  });
}
export function validateDesign(items, id, code, price) {
  code = code.trim().toUpperCase();
  if (!code || code.length > 40) throw new Error('Use a shoe code with 1–40 characters.');
  if (!Number.isFinite(price) || price < 0 || price > 10000000) throw new Error('Enter a price between Rs. 0 and Rs. 10,000,000.');
  if (items.some(item => item.id !== id && item.code.toUpperCase() === code)) throw new Error('That code already exists, including archived designs.');
  return {code, price:Math.round(price * 100) / 100};
}
export function findItem(items, id) {
  const item = items.find(item => item.id === id);
  if (!item) throw new Error('This shoe has changed or been removed. Refresh and try again.');
  return item;
}
export function applyCheckout(items, draft) {
  const next = normalizeItems(items);
  const item = findItem(next, draft.itemId);
  if (item.archived) throw new Error('This design is archived.');
  if (!SIZES.includes(draft.size)) throw new Error('Choose a valid size.');
  if (!Number.isSafeInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 9999) throw new Error('Enter a valid quantity.');
  if (!['COD','Bank transfer'].includes(draft.paymentMethod)) throw new Error('Choose a payment method.');
  if (!['Pending','Paid'].includes(draft.paymentStatus)) throw new Error('Choose a payment status.');
  if (item.price <= 0) throw new Error('Set a selling price in Edit inventory before checkout.');
  if (item.price !== draft.expectedPrice || item.code !== draft.expectedCode) throw new Error('The code or price changed. Reopen checkout to review it.');
  const index = SIZES.indexOf(draft.size);
  if (item.quantities[index] < draft.quantity) throw new Error('Not enough stock for this size.');
  item.quantities[index] -= draft.quantity;
  return {items:next, sale:{
    itemId:item.id, shoeCode:item.code, size:draft.size, quantity:draft.quantity,
    price:item.price, total:Math.round(item.price * draft.quantity * 100) / 100,
    paymentMethod:draft.paymentMethod, paymentStatus:draft.paymentStatus,
    customer:String(draft.customer || '').trim().slice(0,100),
    note:String(draft.note || '').trim().slice(0,300)
  }};
}
export function summarize(items) {
  const active = items.filter(item => !item.archived);
  return {
    designs:active.length,
    pairs:active.reduce((sum,item) => sum + item.quantities.reduce((a,b) => a+b,0),0),
    value:active.reduce((sum,item) => sum + item.price * item.quantities.reduce((a,b) => a+b,0),0),
    low:active.filter(item => item.quantities.some(n => n <= 2)).length
  };
}
