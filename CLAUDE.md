# PagsDark 💸

Plataforma **local** (roda no seu Mac) com **duas funções**, nada além disso:

1. **Edição de vídeo em massa** — você joga um *molde* (arte PNG 9:16 com uma área
   transparente onde o vídeo entra) + uma pasta de vídeos. O sistema recorta cada
   vídeo na área do molde, sobrepõe a arte, e gera todos em lote (9:16). Saída:
   **baixar em ZIP** ou **enviar para a biblioteca** do agendador.
2. **Agendamento automático de posts** — vincule contas (estilo "BM": workspaces) de
   **YouTube Shorts, Instagram Reels, Facebook e TikTok** e crie **Campanhas**: escolha um lote
   de vídeos, as contas, "X posts por dia" e os horários fixos (08h, 10h, 12h…). O
   sistema distribui tudo pelo mês e **posta sozinho** enquanto o app estiver rodando.

> Fora de escopo de propósito: qualquer terceira função, edição avançada, analytics.

---

## Como rodar

```bash
npm install
cp .env.example .env     # e preencha as credenciais (veja README.md)
npm start                # abre em http://localhost:4310
```

O app precisa ficar **aberto** para os agendamentos dispararem (é um worker local).

---

## Mapa do projeto (onde está cada coisa)

```
src/
  server.js            Sobe o Express, serve a UI e liga o worker do agendador
  config.js            Lê o .env (porta, chaves, credenciais)
  db.js                Banco SQLite (tabelas) + funções de acesso
  ffmpeg.js            Aponta o fluent-ffmpeg para os binários estáticos
  crypto.js            Cifra/decifra os tokens das contas
  auth.js              Login dos usuários (valida o JWT do Supabase) — opcional

  editor/              FUNÇÃO 1 — edição em massa
    mold.js              Detecta a área transparente do molde PNG (onde o vídeo entra)
    render.js            Renderiza 1 vídeo dentro do molde (filtro ffmpeg)
    batch.js             Roda a renderização em lote, com progresso

  scheduler/           FUNÇÃO 2 — agendamento
    queue.js             CRUD de posts agendados
    campaign.js          Gera a campanha do mês (X/dia nos horários fixos)
    worker.js            A cada minuto, posta o que venceu

  platforms/           Integração com cada rede
    youtube.js           OAuth + upload (Shorts)
    instagram.js         OAuth + Reels (precisa de URL pública -> túnel)
    facebook.js          OAuth + upload de vídeo na Página (Graph API)
    tiktok.js            OAuth + envio de arquivo (rascunho/privado até auditar)
  tunnel.js            Sobe um túnel temporário (cloudflared) p/ o Instagram

  routes/              Endpoints HTTP usados pela interface
    accounts.js          Workspaces + contas + callbacks de OAuth
    editor.js            Upload de molde/vídeos, renderização, download/export
    schedule.js          Campanhas, calendário e posts

public/                A interface (HTML/CSS/JS puro, tema escuro laranja)
scripts/               install-daemon.sh / uninstall-daemon.sh (serviço de 2º plano)
data/                  (não vai pro git) banco + vídeos + saídas + daemon.log
```

## Rodar com o app fechado (daemon)

`npm run daemon:install` registra um LaunchAgent (`com.pagsdark.server`) que mantém o
servidor + agendador sempre rodando e inicia ao logar — assim os posts disparam mesmo
com o navegador fechado. `npm run daemon:uninstall` remove. Logs em `data/daemon.log`.

## Editor: área do vídeo + posicionamento (pan)

No passo 3 do Editor há um preview em canvas. O usuário define a **área** onde o
vídeo entra de 3 formas: **presets** (Centro/Inteiro/Topo/Base), **arrastando** um
retângulo no preview, ou pela **detecção automática** do furo transparente do PNG.
A área é salva no molde (`area_x/y/w/h`, `POST /api/editor/molds/:id/area`).
O **render** decide a composição pelo `has_alpha` do molde: com furo transparente,
a arte vai por cima (vídeo aparece pelo buraco); molde opaco, o vídeo é colado por
cima da arte na área marcada. O **enquadramento** (`focusX`/`focusY`, 0–100) é o
`crop` do ffmpeg e vale para todo o lote.

Thumbnails são **posters JPG gerados sob demanda** (`GET /api/editor/thumb/:id`,
ffmpeg) — não usamos `<video>` na grade (travava o PC). Upload é feito em lotes.
Excluir: `DELETE /sources/:id|/sources|/library/:id|/library|/molds/:id`. Vídeos
importados por referência (pasta do Mac) só somem da lista — o original não é apagado.

## Login e segurança (opcional, Supabase)

`src/auth.js` valida o JWT do Supabase no servidor; `public/login.html` faz o login
(Google / e-mail+senha); `public/auth-guard.js` protege o app e mantém o cookie.
Só liga se `SUPABASE_URL/ANON_KEY/JWT_SECRET` estiverem no `.env` (senão, modo local).
Gate em `src/server.js`. Passo a passo: `SETUP-LOGIN.md`. O servidor escuta só em
`127.0.0.1` e manda cabeçalhos de segurança.

## Virar aplicativo (desktop, Electron)

`electron/main.cjs` sobe o `src/server.js` e abre uma janela. `npm run app` roda;
`npm run dist` (electron-builder) gera o instalador. É o **mesmo site por dentro** —
editar os arquivos e reabrir continua funcionando normalmente.

## Banco de dados (tabelas)

`workspaces`, `accounts`, `molds`, `media_assets`, `render_jobs`, `render_items`,
`campaigns`, `posts`. Schema em `src/db.js`.

## O que funciona hoje vs. depende de aprovação

- **Edição em massa** e **YouTube Shorts**: funcionam hoje.
- **Instagram Reels**: hoje, **se** a conta for Profissional ligada a uma Página.
- **Facebook**: hoje — publica vídeo numa Página que você administra (upload direto).
- **TikTok**: posta como rascunho/privado até o app ser auditado pela TikTok.

Detalhes e passo a passo das contas de desenvolvedor: ver `README.md`.
