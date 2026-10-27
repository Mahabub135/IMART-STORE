const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite');
const PORT=process.env.PORT||3000,WALLET=process.env.TRC20_WALLET_ADDRESS||'',MIN=+process.env.MIN_UNITS||1,PUB=path.join(__dirname,'public');
const db=new DatabaseSync(path.join(__dirname,'data.db'));
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,hash TEXT,admin INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT,price REAL,old_price REAL DEFAULT 0,stock INTEGER,img TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,uid INTEGER,name TEXT,phone TEXT,address TEXT,items TEXT,total REAL,tx TEXT,pay TEXT DEFAULT 'Pending',status TEXT DEFAULT 'Pending',at TEXT DEFAULT CURRENT_TIMESTAMP)`);
const hash=(p,s=crypto.randomBytes(16).toString('hex'))=>s+':'+crypto.scryptSync(p,s,32).toString('hex');
const check=(p,h)=>{const a=Buffer.from(hash(p,h.split(':')[0])),b=Buffer.from(h);return a.length===b.length&&crypto.timingSafeEqual(a,b)};
if(!db.prepare('SELECT 1 FROM products').get()){const i=db.prepare('INSERT INTO products(name,price,old_price,stock,img) VALUES(?,?,?,?,?)');for(const p of JSON.parse(fs.readFileSync(path.join(__dirname,'products.json'))))i.run(p.name,p.price,p.old_price||0,p.stock,p.img||'')}
let AP=process.env.ADMIN_PASSWORD;
if(!db.prepare('SELECT 1 FROM users WHERE admin=1').get()){if(!AP){AP=crypto.randomBytes(6).toString('hex');console.log('Admin login: admin@local /',AP,'(set ADMIN_EMAIL / ADMIN_PASSWORD to choose your own)')}db.prepare('INSERT INTO users(name,email,hash,admin) VALUES(?,?,?,1)').run('Admin',(process.env.ADMIN_EMAIL||'admin@local').toLowerCase(),hash(AP))}
const S=new Map(),tries=new Map();setInterval(()=>tries.clear(),9e5).unref();
const sid=r=>(/sid=([a-f0-9]+)/.exec(r.headers.cookie||'')||[])[1],who=r=>S.get(sid(r));
const send=(res,c,o,h={})=>{res.writeHead(c,{'content-type':'application/json',...h});res.end(JSON.stringify(o))};
const body=r=>new Promise(ok=>{let d='';r.on('data',c=>{d+=c;if(d.length>1e5)r.destroy()});r.on('end',()=>{try{ok(JSON.parse(d||'{}'))}catch{ok({})}})});
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const login=(res,u)=>{const t=crypto.randomBytes(24).toString('hex');S.set(t,{id:u.id,name:u.name,admin:!!u.admin});send(res,200,{name:u.name,admin:!!u.admin},{'set-cookie':`sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`})};
http.createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://x'),p=url.pathname,m=req.method,me=who(req);
if(!p.startsWith('/api/')){const f=p==='/'||p==='/admin'?'index.html':decodeURIComponent(p).slice(1),fp=path.join(PUB,f);
 if(!fp.startsWith(PUB+path.sep)||!fs.existsSync(fp)||!fs.statSync(fp).isFile()){res.writeHead(404);return res.end('Not found')}
 res.writeHead(200,{'content-type':T[path.extname(fp)]||'application/octet-stream','x-content-type-options':'nosniff'});return fs.createReadStream(fp).pipe(res)}
if(m==='GET'&&p==='/api/products')return send(res,200,db.prepare('SELECT * FROM products ORDER BY id').all());
if(m==='GET'&&p==='/api/config')return send(res,200,{wallet:WALLET,min:MIN});
if(m==='GET'&&p==='/api/me')return send(res,200,me?{name:me.name,admin:me.admin}:null);
if(m==='POST'&&p==='/api/logout'){S.delete(sid(req));return send(res,200,{ok:1},{'set-cookie':'sid=; Max-Age=0; Path=/'})}
if(m==='POST'&&(p==='/api/register'||p==='/api/login')){const b=await body(req),ip=req.socket.remoteAddress,email=String(b.email||'').trim().toLowerCase(),pw=String(b.password||'');
 if((tries.get(ip)||0)>=20)return send(res,429,{error:'Too many attempts. Try again in 15 minutes.'});tries.set(ip,(tries.get(ip)||0)+1);
 if(p==='/api/login'){const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!u||!check(pw,u.hash))return send(res,401,{error:'Email or password is wrong.'});return login(res,u)}
 const name=String(b.name||'').trim().slice(0,80);if(!name||!/^\S+@\S+\.\S+$/.test(email)||pw.length<8)return send(res,400,{error:'Enter your name, a valid email and a password of 8+ characters.'});
 if(db.prepare('SELECT 1 FROM users WHERE email=?').get(email))return send(res,409,{error:'This email already has an account. Sign in instead.'});
 const r=db.prepare('INSERT INTO users(name,email,hash) VALUES(?,?,?)').run(name,email,hash(pw));return login(res,{id:Number(r.lastInsertRowid),name,admin:0})}
if(!me)return send(res,401,{error:'Sign in first.'});
if(m==='GET'&&p==='/api/orders')return send(res,200,db.prepare('SELECT id,items,total,pay,status,at FROM orders WHERE uid=? ORDER BY id DESC').all(me.id));
if(m==='POST'&&p==='/api/orders'){const b=await body(req),items=Array.isArray(b.items)?b.items:[],name=String(b.name||'').trim(),phone=String(b.phone||'').trim(),address=String(b.address||'').trim(),tx=String(b.tx||'').trim();
 if(!name||!phone||address.length<10)return send(res,400,{error:'Enter your name, phone and full delivery address.'});
 if(WALLET&&tx.length<10)return send(res,400,{error:'Enter the USDT transaction hash after you pay.'});
 db.exec('BEGIN');try{let total=0,units=0;const out=[];
  for(const it of items){const q=Math.floor(+it.qty),pr=db.prepare('SELECT * FROM products WHERE id=?').get(+it.id);if(!pr||!(q>0))throw new Error('Invalid cart item.');if(pr.price<=0)throw new Error(pr.name+' has no price yet.');if(pr.stock<q)throw new Error(pr.name+': only '+pr.stock+' in stock.');
   db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(q,pr.id);total+=pr.price*q;units+=q;out.push({id:pr.id,name:pr.name,price:pr.price,qty:q})}
  if(!out.length)throw new Error('Your cart is empty.');if(units<MIN)throw new Error('Minimum order is '+MIN+' units.');
  const r=db.prepare('INSERT INTO orders(uid,name,phone,address,items,total,tx) VALUES(?,?,?,?,?,?,?)').run(me.id,name,phone,address,JSON.stringify(out),total,tx);db.exec('COMMIT');return send(res,200,{id:Number(r.lastInsertRowid),total})}
 catch(e){db.exec('ROLLBACK');return send(res,400,{error:e.message})}}
if(!me.admin)return send(res,403,{error:'Admins only.'});
if(m==='GET'&&p==='/api/admin/orders')return send(res,200,db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all());
if(m==='POST'&&p==='/api/admin/order'){const b=await body(req);if(!['Pending','Paid','Rejected'].includes(b.pay)||!['Pending','Confirmed','Shipped','Delivered','Cancelled'].includes(b.status))return send(res,400,{error:'Bad status.'});
 db.prepare('UPDATE orders SET pay=?,status=? WHERE id=?').run(b.pay,b.status,+b.id);return send(res,200,{ok:1})}
if(m==='POST'&&p==='/api/admin/product'){const b=await body(req);if(!(+b.price>=0)||!(+b.old_price>=0)||!(+b.stock>=0))return send(res,400,{error:'Bad numbers.'});
 db.prepare('UPDATE products SET price=?,old_price=?,stock=?,img=? WHERE id=?').run(+b.price,+b.old_price,Math.floor(+b.stock),String(b.img||''),+b.id);return send(res,200,{ok:1})}
send(res,404,{error:'Not found'})}catch(e){console.error(e);send(res,500,{error:'Server error'})}}).listen(PORT,()=>console.log('iMart running on http://localhost:'+PORT));
