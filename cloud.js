(()=>{
  const cfg=window.AUTOCARE_CONFIG||{};
  if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase?.createClient)return;
  document.body.classList.add('cloud-locked');
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  let vehicleId=null, user=null, syncing=false, timer=null, engineId=null, loading=false;
  const status=t=>{const el=document.getElementById('cloudStatus');if(el)el.textContent=t};
  const authPanel=document.getElementById('authOverlay'), authForm=document.getElementById('authForm'), msg=document.getElementById('authMessage');
  const closeAuth=()=>{document.body.classList.remove('cloud-locked');authPanel?.classList.remove('show')};
  const openAuth=()=>{document.body.classList.add('cloud-locked');authPanel?.classList.add('show')};
  const category=name=>{if(['Óleo','Correia','Tensor','Bomba','arrefecimento'].some(x=>name.includes(x)))return 'Motor e fluidos';if(['Filtro de ar','Filtro de combustível','Velas','Cabos'].some(x=>name.includes(x)))return 'Filtros e ignição';if(['Rolamentos','Pastilhas','Discos','Fluido de freio'].some(x=>name.includes(x)))return 'Freios';if(['Pneus','Alinhamento'].some(x=>name.includes(x)))return 'Pneus e direção';return 'Elétrica e suspensão'};
  async function loadVehicle(session){
    if(loading)return;loading=true;user=session.user;status('Carregando seus dados…');
    try{
      const {data:vehicle,error:vErr}=await client.from('vehicles').select('*').eq('user_id',user.id).maybeSingle();
      if(vErr)throw vErr;
      if(!vehicle){
        const {data:v,error}=await client.from('vehicles').insert({user_id:user.id,nickname:'Meu Classic',make:'Chevrolet',model:'Corsa Classic',model_year:'2012/2013',current_odometer:db.odo||null}).select().single();if(error)throw error;vehicleId=v.id;
        const items=db.maint.map((m,i)=>({vehicle_id:vehicleId,name:m.name,category:category(m.name),icon:m.icon||'🔧',control_rule:m.rule||'Inspeção',interval_km:m.intervalKm||null,interval_months:m.intervalMonths||null,last_service_km:m.lastKm||null,last_service_date:m.lastDate||null,next_service_km:m.nextKm||null,next_service_date:m.nextDate||null,sort_order:i}));
        if(items.length){const {error:e}=await client.from('maintenance_items').insert(items);if(e)throw e;}
        const records=db.services.map(s=>({vehicle_id:vehicleId,service_date:s.date||null,odometer:Number(s.km)||null,title:s.title,category:s.category||'Outros reparos',shop:s.shop||'',parts:s.partsList||[],parts_total:Number(s.parts)||0,labor_total:Number(s.labor)||0,paid_total:Number(s.parts||0)+Number(s.labor||0),notes:s.notes||''}));
        records.push({vehicle_id:vehicleId,title:'Retífica e reconstrução do motor',category:'Motor',is_engine_repair:true,contract_total:Number(db.engine?.contract??0),paid_total:Number(db.engine?.paid??0),notes:db.engine?.notes||'Reparo em andamento. Peças, oficina, quilometragem, fotos e comprovantes aguardando cadastro.'});
        const {error:se}=await client.from('service_records').insert(records);if(se)throw se;
      }else vehicleId=vehicle.id;
      const [{data:items,error:iErr},{data:records,error:rErr}]=await Promise.all([client.from('maintenance_items').select('*').eq('vehicle_id',vehicleId).order('sort_order'),client.from('service_records').select('*').eq('vehicle_id',vehicleId).order('service_date',{ascending:false,nullsFirst:false})]);
      if(iErr)throw iErr;if(rErr)throw rErr;
      db.odo=vehicle.current_odometer||db.odo||null;
      if(items?.length)db.maint=items.map(m=>({id:m.id,name:m.name,icon:m.icon,rule:m.control_rule,intervalKm:m.interval_km,intervalMonths:m.interval_months,lastKm:m.last_service_km,lastDate:m.last_service_date,nextKm:m.next_service_km,nextDate:m.next_service_date,category:m.category}));
      const engine=records.find(s=>s.is_engine_repair);
      engineId=engine?.id||null;
      db.engine=engine?{id:engine.id,contract:Number(engine.contract_total||0),paid:Number(engine.paid_total||0),balance:Number(engine.contract_total||0)-Number(engine.paid_total||0),km:engine.odometer,shop:engine.shop,notes:engine.notes}:{contract:0,paid:0,balance:0};
      db.services=(records||[]).filter(s=>!s.is_engine_repair).map(s=>({id:s.id,title:s.title,category:s.category,date:s.service_date||'',km:s.odometer||'',shop:s.shop,parts:s.parts_total,labor:s.labor_total,notes:s.notes,partsList:s.parts}));
            const serviceIds=(records||[]).filter(s=>!s.is_engine_repair).map(s=>s.id);let attachments=[];if(serviceIds.length){const {data:a,error:ae}=await client.from('service_attachments').select('*').in('service_record_id',serviceIds);if(ae)throw ae;attachments=a||[]}const byService={};for(const a of attachments){const {data:link}=await client.storage.from('autocare-records').createSignedUrl(a.storage_path,3600);(byService[a.service_record_id]??=[]).push({name:a.file_name,url:link?.signedUrl||'#'})}db.services.forEach(s=>s.attachments=byService[s.id]||[]);localStorage.setItem('autocare_classic_v1',JSON.stringify(db));render();closeAuth();status('Sincronizado com o Supabase');
    }catch(e){status('Falha ao carregar dados');msg.textContent=e.message||'Não foi possível conectar ao banco.';openAuth();}
    finally{loading=false}
  }
  async function syncNow(state){if(!user||!vehicleId||syncing)return;syncing=true;status('Salvando…');try{
    const {error:vErr}=await client.from('vehicles').update({current_odometer:state.odo||null}).eq('id',vehicleId);if(vErr)throw vErr;
    const itemRows=state.maint.map((m,i)=>{m.id=m.id||crypto.randomUUID();return{id:m.id,vehicle_id:vehicleId,name:m.name,category:m.category||category(m.name),icon:m.icon||'🔧',control_rule:m.rule||'Inspeção',interval_km:m.intervalKm||null,interval_months:m.intervalMonths||null,last_service_km:m.lastKm||null,last_service_date:m.lastDate||null,next_service_km:m.nextKm||null,next_service_date:m.nextDate||null,sort_order:i}});
    if(itemRows.length){const {error}=await client.from('maintenance_items').upsert(itemRows,{onConflict:'id'});if(error)throw error;}
    const serviceRows=state.services.map(s=>{s.id=s.id||crypto.randomUUID();return{id:s.id,vehicle_id:vehicleId,service_date:s.date||null,odometer:Number(s.km)||null,title:s.title,category:s.category||'Outros reparos',shop:s.shop||'',parts:s.partsList||[],parts_total:Number(s.parts)||0,labor_total:Number(s.labor)||0,paid_total:Number(s.parts||0)+Number(s.labor||0),notes:s.notes||''}});
    const eng=state.engine||{};engineId=engineId||eng.id||crypto.randomUUID();if(serviceRows.length){const {error}=await client.from('service_records').upsert(serviceRows,{onConflict:'id'});if(error)throw error;}
    const {error:eErr}=await client.from('service_records').upsert({id:engineId,vehicle_id:vehicleId,title:'Retífica e reconstrução do motor',category:'Motor',is_engine_repair:true,contract_total:Number(eng.contract||0),paid_total:Number(eng.paid||0),odometer:Number(eng.km)||null,shop:eng.shop||'',notes:eng.notes||''},{onConflict:'id'});if(eErr)throw eErr;
    localStorage.setItem('autocare_classic_v1',JSON.stringify(state));status('Sincronizado com o Supabase');
  }catch(e){status('Não foi possível sincronizar');console.error(e)}finally{syncing=false}}
  async function uploadAttachments(id,files){const service=db.services.find(s=>s.id===id);if(!user||!vehicleId||!service||!files?.length)return;status('Salvando anexos…');try{const row={id:service.id,vehicle_id:vehicleId,service_date:service.date||null,odometer:Number(service.km)||null,title:service.title,category:service.category||'Outros reparos',shop:service.shop||'',parts:service.partsList||[],parts_total:Number(service.parts)||0,labor_total:Number(service.labor)||0,paid_total:Number(service.parts||0)+Number(service.labor||0),notes:service.notes||''};const {error:recordError}=await client.from('service_records').upsert(row,{onConflict:'id'});if(recordError)throw recordError;for(const file of files){if(file.size>10485760)throw new Error('Cada arquivo deve ter no máximo 10 MB.');if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw new Error('Formato de anexo não aceito.');const safe=file.name.replace(/[^\w.-]/g,'_'),path=`${user.id}/${vehicleId}/${id}/${crypto.randomUUID()}-${safe}`;const {error}=await client.storage.from('autocare-records').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;const {error:dbError}=await client.from('service_attachments').insert({service_record_id:id,storage_path:path,file_name:file.name,content_type:file.type});if(dbError)throw dbError;const {data:link}=await client.storage.from('autocare-records').createSignedUrl(path,3600);(service.attachments??=[]).push({name:file.name,url:link?.signedUrl||'#'})}render();status('Anexos salvos no Supabase')}catch(e){status('Falha ao enviar anexos');msg.textContent=e.message||'Não foi possível salvar os arquivos.';console.error(e)}}  async function handleSession(session){if(session)await loadVehicle(session);else{user=null;vehicleId=null;openAuth();status('Entre para sincronizar seus dados')}}
  let signup=false;
  document.getElementById('authMode')?.addEventListener('click',()=>{signup=!signup;document.getElementById('authSubmit').textContent=signup?'Criar conta':'Entrar';document.getElementById('authMode').textContent=signup?'Já tenho uma conta':'Criar uma conta';msg.textContent='';});
  authForm?.addEventListener('submit',async e=>{e.preventDefault();msg.textContent='Conectando…';const email=authForm.email.value.trim(),password=authForm.password.value;const result=signup?await client.auth.signUp({email,password}):await client.auth.signInWithPassword({email,password});if(result.error){msg.textContent=result.error.message;return}if(signup&&!result.data.session){msg.textContent='Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.';return}msg.textContent='';await handleSession(result.data.session)});
  document.getElementById('logoutBtn')?.addEventListener('click',async()=>{await client.auth.signOut()});
  client.auth.onAuthStateChange((_event,session)=>{if(!session){user=null;vehicleId=null;openAuth()}else if(!user)void handleSession(session)});
  window.AutoCareCloud={init:async()=>{const {data,error}=await client.auth.getSession();if(error){status('Erro de autenticação');openAuth();return}if(data.session)await handleSession(data.session);else openAuth()},save:state=>{if(!user||!vehicleId)return;clearTimeout(timer);timer=setTimeout(()=>void syncNow(state),350)},deleteService:id=>{if(user&&id)void client.from('service_records').delete().eq('id',id)},uploadAttachments};
})();


