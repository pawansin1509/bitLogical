async function postJson(url, body){
  const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  return res;
}

const loginForm = document.getElementById('loginForm');
loginForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  try{
    const res = await postJson('/api/login', {email,password});
    const j = await res.json();
    if(res.ok){
      localStorage.setItem('token', j.token);
      localStorage.setItem('user', JSON.stringify(j.user));
      window.location.href = '/index.html';
    } else {
      alert(j.error || 'Login failed');
    }
  }catch(e){ alert('Login request failed'); }
});