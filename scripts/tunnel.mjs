// Coloca o app NO AR com um link público (cloudflared), apontando para o servidor
// local. Uso:  npm run tunnel   (com o app já rodando em outra janela: npm start/npm run app).
//
// ATENÇÃO: isto expõe seu app na internet (qualquer pessoa com o link chega na
// tela de login). O login protege o acesso, mas você está publicando o servidor.
// O link é temporário: vale enquanto esta janela e o app estiverem abertos.
import { bin, install } from 'cloudflared';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import 'dotenv/config';

const PORT = process.env.PORT || 4310;

if (!existsSync(bin)) {
  console.log('Baixando o cloudflared (só na primeira vez)…');
  await install(bin);
}

console.log(`Abrindo o túnel para http://localhost:${PORT} …\n`);
const cf = spawn(bin, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'],
  { stdio: ['ignore', 'pipe', 'pipe'] });

let printed = false;
const scan = (buf) => {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !printed) {
    printed = true;
    console.log('\n========================================================');
    console.log('  🌐  SEU APP NO AR (link público):');
    console.log('      ' + m[0]);
    console.log('========================================================');
    console.log('  • Abra no celular ou em qualquer navegador e faça login.');
    console.log('  • Mantenha ESTA janela e o app abertos — se fechar, o link cai.');
    console.log('  • Ao reabrir, um novo link é gerado.\n');
  }
};
cf.stdout.on('data', scan);
cf.stderr.on('data', scan);
cf.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => { try { cf.kill(); } catch {} process.exit(0); });
