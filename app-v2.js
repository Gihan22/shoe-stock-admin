import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, query, orderBy, limit, runTransaction, serverTimestamp, getDocFromServer, getDocsFromServer, documentId, startAfter } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {SIZES, MAX_DESIGNS, normalizeItems, validateDesign, findItem, applyCheckout, summarize} from './inventory-model.mjs';

const app = initializeApp({
  apiKey:'AIzaSyAxPWU1sdQ6yIA6wFgz7PWg6V7CKMualk8',
  authDomain:'shoe-stock-gihan.firebaseapp.com', projectId:'shoe-stock-gihan',
  storageBucket:'shoe-stock-gihan.firebasestorage.app', messagingSenderId:'994044704410',
  appId:'1:994044704410:web:be5a3b7b2f23638b405123'
});
const auth = getAuth(app), db = getFirestore(app);
const stockRef = doc(db,'inventory','current');
const salesRef = collection(db,'sales'), photosRef = collection(db,'photos');
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-LK',{style:'currency',currency:'LKR'}).format(Number(value)||0);
let items = [], sales = [], stops = [], photos = {}, edit = false, ready = false, busy = false;
let designTarget = null, checkoutDraft = null, archiveTarget = null, sessionVersion = 0;
let localPhotos = {};
try { localPhotos = JSON.parse(localStorage.getItem('shoe-stock-images') || '{}') || {}; } catch { /* Local storage may be unavailable. */ }
function message(text,error=false) {
  $('#status-message').textContent = text;
  $('#status-message').classList.toggle('error',error);
}
function explain(error) {
  if (error.code === 'permission-denied') return 'Access was denied. Sign in with your approved Avelon Edge account.';
  if (error.code === 'resource-exhausted') return 'The free database quota is currently reached. Try again after the quota resets.';
  if (error.code === 'unavailable') return 'Cannot reach the database. Check your internet and try again.';
  return error.message || 'Could not save. Please try again.';
}
async function perform(button, task, success, errorTarget) {
  if (busy) return;
  busy = true;
  if (button) button.disabled = true;
  message('Saving…');
  if(errorTarget) errorTarget.textContent = '';
  try {
    if (!auth.currentUser || !ready) throw new Error('Wait for the inventory to connect.');
    if (!navigator.onLine) throw new Error('You are offline. Reconnect before saving.');
    await task();
    message(success);
  } catch(error) {
    message(explain(error),true);
    if(errorTarget) errorTarget.textContent = explain(error);
  } finally {
    busy = false;
    if(button) button.disabled = false;
  }
}
async function mutateInventory(transform) {
  return runTransaction(db,async transaction=>{
    const snapshot = await transaction.get(stockRef);
    if (!snapshot.exists()) throw new Error('The shared inventory is missing. No stock was reset.');
    const next = normalizeItems(snapshot.data().items);
    transform(next);
    transaction.update(stockRef,{items:next,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});
  });
}
function photoFor(item) { return photos[item.id] || localPhotos[item.code] || ''; }
function safePhoto(data) {
  return typeof data === 'string' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data);
}
function renderInventory() {
  const stats = summarize(items);
  $('#total-pairs').textContent = stats.pairs;
  $('#total-designs').textContent = stats.designs;
  $('#stock-value').textContent = money(stats.value);
  $('#low-stock-count').textContent = stats.low;
  const term = $('#search').value.trim().toUpperCase(), filter = $('#stock-filter').value;
  const visible = items.filter(item => item.code.toUpperCase().includes(term) &&
    (filter === 'archived' ? item.archived : !item.archived) &&
    (filter !== 'low' || item.quantities.some(n=>n<=2)));
  $('#search-result').textContent = `${visible.length} designs shown`;
  $('#inventory-table').innerHTML = visible.map(item=>{
    const id = esc(item.id), code = esc(item.code), photo = photoFor(item);
    const cells = item.quantities.map((n,i)=>`<td data-label="Size ${SIZES[i]}" class="${n===0?'out':n<=2?'low':''}">${edit && !item.archived ? `<span class="quantity"><button data-action="adjust" data-id="${id}" data-size="${i}" data-change="-1" aria-label="Remove one ${code}, size ${SIZES[i]}">−</button><output>${n}</output><button data-action="adjust" data-id="${id}" data-size="${i}" data-change="1" aria-label="Add one ${code}, size ${SIZES[i]}">+</button></span>`:n}</td>`).join('');
    return `<tr><td><div class="shoe-cell"><button class="shoe-image" data-action="photo-view" data-id="${id}" aria-label="Enlarge ${code} photo">${safePhoto(photo)?`<img src="${photo}" alt="${code}" loading="lazy">`:'PHOTO'}</button><div><strong>${code}</strong><small>${item.archived?'Archived':item.price>0?'':'Set a selling price'}</small></div></div></td>${cells}<td data-label="Price" class="price-cell">${money(item.price)}</td><td data-label="Total pairs">${item.quantities.reduce((a,b)=>a+b,0)}</td><td><div class="row-actions">${item.archived?`<button class="quiet-button" data-action="restore" data-id="${id}">Restore</button>`:edit?`<button class="quiet-button" data-action="edit" data-id="${id}">Edit code / price</button><button class="quiet-button" data-action="photo" data-id="${id}">Photo</button><button class="delete-button" data-action="archive" data-id="${id}">Archive</button>`:`<button class="checkout-button" data-action="checkout" data-id="${id}" ${item.quantities.every(n=>n===0)||!ready?'disabled':''}>Checkout</button>`}</div></td></tr>`;
  }).join('') || '<tr><td colspan="9">No shoes match this view.</td></tr>';
  $('#add-design-button').hidden = !edit;
  $('#edit-button').textContent = edit?'Done editing':'Edit inventory';
  $('#import-photos-button').hidden = !items.some(item=>!photos[item.id] && safePhoto(localPhotos[item.code]));
}
function dateText(timestamp) {
  return timestamp?.toDate ? timestamp.toDate().toLocaleString('en-LK',{timeZone:'Asia/Colombo',dateStyle:'medium',timeStyle:'short'}) : 'Date unavailable';
}
function renderSales() {
  const filter = $('#sales-filter').value;
  const visible = sales.filter(s=>filter==='all'||(s.paymentStatus||'Unknown')===filter);
  const total = s => s.total ?? s.price * (s.quantity||1);
  $('#sales-summary').textContent = `Latest ${sales.length} orders · Sales ${money(sales.reduce((n,s)=>n+total(s),0))} · Pending ${money(sales.filter(s=>s.paymentStatus==='Pending').reduce((n,s)=>n+total(s),0))}`;
  $('#sales-list').innerHTML = visible.map(s=>`<li><div><strong>${esc(s.shoeCode)} · Size ${esc(s.size)} · ${s.quantity||1} pair(s)</strong><small>${esc(dateText(s.createdAt))} · #${esc(s.id.slice(-6))}</small><small>${esc(s.customer||'No customer note')}${s.note?` · ${esc(s.note)}`:''}</small></div><div class="sale-money">${money(total(s))}<small>${esc(s.paymentMethod)} · <b>${esc(s.paymentStatus||'Unknown')}</b></small>${s.paymentStatus!=='Paid'?`<button class="quiet-button" data-paid="${esc(s.id)}">Mark paid</button>`:''}</div></li>`).join('') || '<li>No orders in this view.</li>';
}
function showDesign(item=null) {
  designTarget = item ? {...item} : null;
  $('#design-title').textContent = item?'Edit shoe design':'Add shoe design';
  $('#design-code').value = item?.code || '';
  $('#design-price').value = item?.price || '';
  $('#starting-stock').hidden = !!item;
  $('#starting-stock').innerHTML = SIZES.map(size=>`<label>Size ${size}<input name="size-${size}" type="number" min="0" max="9999" step="1" value="0" required></label>`).join('');
  $('#design-message').textContent = '';
  $('#design-dialog').showModal();
}
$('#design-form').addEventListener('submit',event=>{
  event.preventDefault();
  const code = $('#design-code').value, price = Number($('#design-price').value), target = designTarget;
  const id = target?.id || crypto.randomUUID();
  const quantities = SIZES.map(size=>Number($(`[name="size-${size}"]`).value));
  perform(event.submitter,async()=>{
    await mutateInventory(next=>{
      const values = validateDesign(next,id,code,price);
      if(target){
        const current = findItem(next,id);
        if(current.code!==target.code || current.price!==target.price || current.archived) throw new Error('Your partner changed this design. Close and reopen the editor.');
        Object.assign(current,values);
      } else {
        if(next.length>=MAX_DESIGNS) throw new Error('The compact inventory supports 500 designs. Download a backup and contact the administrator to expand it.');
        if(quantities.some(n=>!Number.isSafeInteger(n)||n<0||n>9999)) throw new Error('Enter whole quantities between 0 and 9,999.');
        next.push({id,...values,quantities,archived:false});
      }
    });
    if(target && target.code!==code.trim().toUpperCase() && localPhotos[target.code]){
      localPhotos[code.trim().toUpperCase()] = localPhotos[target.code];
      try { localStorage.setItem('shoe-stock-images',JSON.stringify(localPhotos)); } catch {}
    }
    $('#design-dialog').close();
  },'Shoe design saved.',$('#design-message'));
});
$('#inventory-table').addEventListener('click',event=>{
  const button = event.target.closest('button[data-action]');
  if(!button || busy) return;
  const item = items.find(i=>i.id===button.dataset.id);
  if(!item) return;
  switch(button.dataset.action){
    case 'edit': showDesign(item); break;
    case 'photo': choosePhoto(item); break;
    case 'photo-view':
      if(safePhoto(photoFor(item))){ $('#large-photo').src=photoFor(item); $('#large-photo').alt=item.code; $('#photo-dialog').showModal(); }
      break;
    case 'checkout': openCheckout(item); break;
    case 'archive':
      archiveTarget=item.id;
      $('#archive-text').textContent=`Archive ${item.code}? Its stock and photo will be kept. You can restore it from the Archived view. Previous sales remain in history.`;
      $('#archive-dialog').showModal(); break;
    case 'restore': perform(button,()=>mutateInventory(next=>{findItem(next,item.id).archived=false;}),'Design restored.'); break;
    case 'adjust': perform(button,()=>mutateInventory(next=>{
      const current=findItem(next,item.id), index=Number(button.dataset.size), change=Number(button.dataset.change);
      if(current.archived) throw new Error('This design is archived.');
      const quantity=current.quantities[index]+change;
      if(quantity<0||quantity>9999) throw new Error('Quantity must stay between 0 and 9,999.');
      current.quantities[index]=quantity;
    }),'Stock saved.'); break;
  }
});
$('#confirm-archive').onclick = event=>perform(event.currentTarget,async()=>{
  const id=archiveTarget;
  await mutateInventory(next=>{findItem(next,id).archived=true;});
  $('#archive-dialog').close();
},'Design archived.');
function openCheckout(item) {
  checkoutDraft={itemId:item.id,expectedCode:item.code,expectedPrice:item.price,saleId:doc(salesRef).id};
  $('#checkout-form').reset();
  $('#checkout-code').textContent=item.code;
  $('#checkout-size').innerHTML=SIZES.map((size,i)=>`<option value="${size}" ${item.quantities[i]===0?'disabled':''}>${size} · ${item.quantities[i]} in stock</option>`).join('');
  const first=item.quantities.findIndex(n=>n>0);
  $('#checkout-size').value=String(SIZES[first]);
  $('#checkout-message').textContent='';
  updateCheckoutTotal();
  $('#checkout-dialog').showModal();
}
function updateCheckoutTotal(){
  $('#checkout-total').textContent=money((checkoutDraft?.expectedPrice||0)*Number($('#checkout-quantity').value));
}
$('#checkout-quantity').oninput=updateCheckoutTotal;
$('#checkout-form').onsubmit = event=>{
  event.preventDefault();
  if(!checkoutDraft)return;
  const draft={...checkoutDraft,size:Number($('#checkout-size').value),quantity:Number($('#checkout-quantity').value),paymentMethod:$('#payment-method').value,paymentStatus:$('#payment-status').value,customer:$('#customer').value,note:$('#order-note').value};
  perform(event.submitter,async()=>{
    const saleRef=doc(salesRef,draft.saleId);
    await runTransaction(db,async transaction=>{
      // A fixed order ID also makes a retry after an uncertain network response safe.
      const [stock,existing]=await Promise.all([transaction.get(stockRef),transaction.get(saleRef)]);
      if(existing.exists())return;
      if(!stock.exists())throw new Error('Inventory is missing.');
      const result=applyCheckout(stock.data().items,draft);
      transaction.update(stockRef,{items:result.items,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});
      transaction.set(saleRef,{...result.sale,createdAt:serverTimestamp(),createdBy:auth.currentUser.email});
    });
    $('#checkout-dialog').close(); checkoutDraft=null;
  },'Order saved and stock updated.',$('#checkout-message'));
};
$('#sales-list').onclick=event=>{
  const button=event.target.closest('[data-paid]');
  if(!button)return;
  perform(button,()=>runTransaction(db,async transaction=>{
    const ref=doc(salesRef,button.dataset.paid), snapshot=await transaction.get(ref);
    if(!snapshot.exists())throw new Error('Order no longer exists.');
    transaction.update(ref,{paymentStatus:'Paid',paidAt:serverTimestamp(),paidBy:auth.currentUser.email});
  }),'Payment recorded.');
};
async function compressPhoto(source) {
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Cannot read this photo. Use a JPG, PNG or WebP image.'));image.src=source;});
  const canvas=document.createElement('canvas');
  for(const edge of [480,360,240]){
    const scale=Math.min(1,edge/Math.max(image.width,image.height));
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.72,.5,.3]){
      const data=canvas.toDataURL('image/jpeg',quality);
      if(data.length<=60000)return data;
    }
  }
  throw new Error('This photo is too detailed. Choose a simpler image.');
}
async function savePhoto(itemId,data,onlyIfMissing=false) {
  const ref=doc(photosRef,itemId);
  await runTransaction(db,async transaction=>{
    const stock=await transaction.get(stockRef);
    if(!stock.exists())throw new Error('Inventory is missing.');
    findItem(normalizeItems(stock.data().items),itemId);
    const previous=await transaction.get(ref);
    if(onlyIfMissing&&previous.exists())return;
    transaction.set(ref,{data,updatedAt:serverTimestamp()});
  });
}
function choosePhoto(item) {
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';
  input.onchange=()=>{
    const file=input.files[0];if(!file)return;
    perform(null,async()=>{
      if(file.size>10000000)throw new Error('Choose an image smaller than 10 MB.');
      const url=URL.createObjectURL(file);
      try { await savePhoto(item.id,await compressPhoto(url)); } finally { URL.revokeObjectURL(url); }
    },'Photo saved to the shared database.');
  };
  input.click();
}
$('#import-photos-button').onclick=event=>perform(event.currentTarget,async()=>{
  const pending=items.filter(item=>!photos[item.id]&&safePhoto(localPhotos[item.code]));
  for(const item of pending) await savePhoto(item.id,await compressPhoto(localPhotos[item.code]),true);
},'Photos from this browser copied to the shared database.');
async function readAll(ref) {
  const records=[];let cursor;
  do {
    const page=await getDocsFromServer(query(ref,orderBy(documentId()),...(cursor?[startAfter(cursor)]:[]),limit(200)));
    records.push(...page.docs.map(d=>({id:d.id,...d.data()})));
    cursor=page.size===200?page.docs.at(-1):null;
  } while(cursor);
  return records;
}
function download(name,data,type) {
  const url=URL.createObjectURL(new Blob([data],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('#backup-button').onclick=event=>perform(event.currentTarget,async()=>{
  const [stock,allSales,allPhotos]=await Promise.all([getDocFromServer(stockRef),readAll(salesRef),readAll(photosRef)]);
  if(!stock.exists())throw new Error('Inventory is missing; backup cancelled.');
  download(`avelon-edge-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({formatVersion:1,shop:'Avelon Edge',exportedAt:new Date().toISOString(),inventory:stock.data(),sales:allSales,photos:allPhotos},null,2),'application/json');
},'Backup downloaded: inventory, all sales and shared photos. Keep it somewhere safe.');
$('#csv-button').onclick=event=>perform(event.currentTarget,async()=>{
  const all=await readAll(salesRef);
  const cell=value=>`"${String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')}"`;
  const rows=[['Order ID','Shoe code','Size','Quantity','Unit price LKR','Total LKR','Method','Status','Customer','Note','Created at'],...all.map(s=>[s.id,s.shoeCode,s.size,s.quantity||1,s.price,s.total??s.price*(s.quantity||1),s.paymentMethod,s.paymentStatus||'Unknown',s.customer,s.note,dateText(s.createdAt)])];
  download('avelon-edge-sales.csv','\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
},'All sales exported.');
$('#login-form').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;$('#login-message').textContent='Signing in…';
  try {await signInWithEmailAndPassword(auth,$('#email').value.trim(),$('#password').value);$('#password').value='';$('#login-message').textContent='';}
  catch {$('#login-message').textContent='Could not sign in. Check your email, password and connection.';}
  finally {button.disabled=false;}
};
$('#reset-password-button').onclick=async()=>{
  const email=$('#email').value.trim();if(!email){$('#login-message').textContent='Enter your email first.';return;}
  try {await sendPasswordResetEmail(auth,email);$('#login-message').textContent='If an account exists, a reset email has been requested. Check Spam too.';}
  catch {$('#login-message').textContent='Could not request a reset. Please try again later.';}
};
$('#password-form').onsubmit=event=>{
  event.preventDefault();
  perform(event.submitter,async()=>{
    if($('#new-password').value!==$('#repeat-password').value)throw new Error('The new passwords do not match.');
    await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,$('#current-password').value));
    await updatePassword(auth.currentUser,$('#new-password').value);
    $('#password-dialog').close();$('#password-form').reset();
  },'Password changed.',$('#password-message'));
};
$('#change-password-button').onclick=()=>{$('#password-form').reset();$('#password-message').textContent='';$('#password-dialog').showModal();};
$('#sign-out-button').onclick=()=>{if(!busy)signOut(auth).catch(error=>message(explain(error),true));};
$('#edit-button').onclick=()=>{edit=!edit;renderInventory();};
$('#add-design-button').onclick=()=>showDesign();
$('#search').oninput=renderInventory;
$('#stock-filter').onchange=renderInventory;
$('#sales-filter').onchange=renderSales;
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{if(!busy)button.closest('dialog').close();});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();}));
window.addEventListener('offline',()=>{$('#sync-state').textContent='Offline · reconnect to save';message('You are offline. Displayed data may be out of date.',true);});
window.addEventListener('online',()=>{$('#sync-state').textContent='Reconnecting…';message('Connection restored. Waiting for shared data.');});
onAuthStateChanged(auth,user=>{
  const version=++sessionVersion;
  stops.forEach(stop=>stop());stops=[];items=[];sales=[];photos={};ready=false;edit=false;
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  $('#login-screen').hidden=!!user;$('#inventory-screen').hidden=!user;
  $('#inventory-table').innerHTML='';$('#sales-list').innerHTML='';checkoutDraft=null;
  if(!user)return;
  $('#signed-in-as').textContent=user.email;
  $('#sync-state').textContent='Connecting…';message('Loading shared inventory…');
  stops.push(onSnapshot(stockRef,{includeMetadataChanges:true},snapshot=>{
    if(version!==sessionVersion)return;
    try {
      if(!snapshot.exists()){if(!snapshot.metadata.fromCache)throw new Error('Shared inventory is missing. Contact the administrator; nothing has been reset.');return;}
      items=normalizeItems(snapshot.data().items);
      ready=!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
      $('#sync-state').textContent=ready?'Connected · shared database':'Connecting · data may be out of date';
      renderInventory();
      if(ready && $('#status-message').textContent==='Loading shared inventory…')message('Inventory loaded.');
    } catch(error){ready=false;message(explain(error),true);}
  },error=>{ready=false;$('#sync-state').textContent='Database unavailable';message(explain(error),true);}));
  stops.push(onSnapshot(query(salesRef,orderBy('createdAt','desc'),limit(50)),snapshot=>{
    if(version!==sessionVersion)return;
    sales=snapshot.docs.map(d=>({id:d.id,...d.data()}));renderSales();
  },error=>{$('#sales-summary').textContent=explain(error);}));
  stops.push(onSnapshot(query(photosRef,limit(MAX_DESIGNS)),snapshot=>{
    if(version!==sessionVersion)return;
    photos=Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data().data]));renderInventory();
  },error=>message(`Photos: ${explain(error)}`,true)));
});
