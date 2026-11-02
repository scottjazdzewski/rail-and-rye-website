(()=>{'use strict';
const form=document.getElementById('rr-race-alert-form');
const status=document.getElementById('rr-race-alert-status');
if(!form||!status)return;
const params=new URLSearchParams(location.search);
const state=params.get('alerts');
if(state==='confirmed')status.textContent='Your email is confirmed. We’ll let you know when a new Race Card is published.';
else if(state==='invalid')status.textContent='That confirmation link has expired or was already used. Request a new confirmation below.';
else if(state==='unavailable')status.textContent='We could not confirm that request. Please try again or contact support.';
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!form.reportValidity())return;
 const button=form.querySelector('button[type=submit]');
 const original=button.textContent;
 const email=form.querySelector('input[type=email]');
 const consent=form.querySelector('input[name=consent]');
 const honeypot=form.querySelector('input[name=website]');
 button.disabled=true;button.textContent='SENDING…';status.textContent='';
 try{
  const response=await fetch('/api/race-card-alerts/subscribe',{
   method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({email:email.value,consent:consent.checked,website:honeypot.value})
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Unable to send the confirmation email.');
  status.textContent=data.message||'Check your inbox for a confirmation link.';
  if(response.status===202)form.reset();
 }catch(error){status.textContent=error.message||'Please try again in a moment.';}
 finally{button.disabled=false;button.textContent=original;}
});
})();