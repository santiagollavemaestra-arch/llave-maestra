// Migra los datos de las rutas raíz a /agencias/llave-maestra/
// Uso: FIREBASE_DB_SECRET=xxx node scripts/migrate-agencia.js
// El secret está en GitHub → Settings → Secrets → FIREBASE_DB_SECRET

const DB_URL = 'https://llave-maestra-default-rtdb.firebaseio.com';
const AGENCIA_ID = 'llave-maestra';
const SECRET = process.env.FIREBASE_DB_SECRET || process.argv[2];

if (!SECRET) {
  console.error('Error: falta FIREBASE_DB_SECRET. Usalo como variable de entorno o como argumento.');
  console.error('  FIREBASE_DB_SECRET=xxx node scripts/migrate-agencia.js');
  process.exit(1);
}

const COLLECTIONS = ['consultas', 'propiedades', 'propietarios', 'visitas', 'emails'];

async function migrate() {
  console.log('Iniciando migración a /agencias/' + AGENCIA_ID + '/...\n');
  let total = 0;

  for (const col of COLLECTIONS) {
    const srcUrl = DB_URL + '/' + col + '.json?auth=' + SECRET;
    const res = await fetch(srcUrl);
    const data = await res.json();

    if (!data || data.error) {
      console.log(col + ': vacío o error, saltando');
      continue;
    }

    const count = typeof data === 'object' ? Object.keys(data).length : 1;
    const dstUrl = DB_URL + '/agencias/' + AGENCIA_ID + '/' + col + '.json?auth=' + SECRET;
    const putRes = await fetch(dstUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await putRes.json();

    if (result && result.error) {
      console.error(col + ': ERROR - ' + result.error);
    } else {
      console.log(col + ': ✓ ' + count + ' registro(s) migrado(s)');
      total += count;
    }
  }

  console.log('\n✅ Migración completa. ' + total + ' registros totales.');
  console.log('Los datos originales NO fueron eliminados.');
  console.log('Verificá en Firebase Console y luego eliminá las rutas viejas manualmente si todo está bien.');
}

migrate().catch(err => { console.error('Error fatal:', err.message); process.exit(1); });
