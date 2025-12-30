async function postJson(url, body){
  const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  return res;
}

const regForm = document.getElementById('regForm');
const verifyArea = document.getElementById('verifyArea');
const verifyBtn = document.getElementById('verifyBtn');

regForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  try{
    const res = await postJson('/api/register', {name,email,password});
    const json = await res.json();
    if(res.ok){
      alert('Registered. For demo your verification code is: '+json.verificationCode);
      verifyArea.style.display = '';
    } else {
      alert(json.error || 'Register failed');
    }
  }catch(e){ alert('Register request failed'); }
});

verifyBtn.addEventListener('click', async ()=>{
  const code = document.getElementById('verifyCode').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  if(!code||!email) return alert('Enter code and email');
  try{
    const res = await postJson('/api/verify', {email,code});
    const j = await res.json();
    if(res.ok) { alert('Verified — please login'); window.location.href = '/login.html'; }
    else alert(j.error||'Verify failed');
  }catch(e){ alert('Verify request failed'); }
});