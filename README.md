# Projeto Dark 🎬🌙

Plataforma **local** para criadores: edite vídeos em massa e agende postagens
automáticas em **Kwai, TikTok, Instagram e YouTube Shorts**.

- 🎞️ **Editor em massa** — molde (arte 9:16) + pasta de vídeos → tudo recortado e
  formatado em lote. Baixe em ZIP ou mande direto pro agendador.
- 📅 **Campanhas** — agende o mês inteiro de uma vez: "10 posts/dia às 08h, 10h, 12h…"
  e a plataforma posta sozinha.

> ⚠️ Roda **no seu Mac**. Os agendamentos só disparam com o app **aberto**.

---

## 1. Instalar e rodar

```bash
npm install
cp .env.example .env
npm start
```

Abra **http://localhost:4310**.

Gere a chave de criptografia e cole em `ENCRYPTION_KEY` no `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 2. Conectar as redes (contas de desenvolvedor)

Cada rede exige um app de desenvolvedor seu. Crie e cole as credenciais no `.env`.

### YouTube Shorts ✅ (mais rápido)
1. [Google Cloud Console](https://console.cloud.google.com/) → novo projeto.
2. Ative **YouTube Data API v3**.
3. Tela de consentimento OAuth → modo **Testing** → adicione seu e‑mail como tester.
4. Credenciais → **OAuth client ID** (tipo *Web application*).
   - Redirect URI: `http://localhost:4310/oauth/youtube/callback`
5. Copie *Client ID* e *Client secret* → `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`.
> Cota padrão ≈ 6 uploads/dia por projeto até pedir aumento no console.

### Instagram Reels ✅ (se a conta for Profissional)
1. A conta IG precisa ser **Profissional** (Business/Creator) e ligada a uma **Página do Facebook**.
2. [Meta for Developers](https://developers.facebook.com/) → novo app (tipo *Business*).
3. Adicione **Facebook Login** e **Instagram Graph API**.
4. Redirect URI: `http://localhost:4310/oauth/instagram/callback`
5. Copie *App ID* e *App secret* → `META_APP_ID` / `META_APP_SECRET`.
> Limite ≈ 50 posts/24h. Publicação usa URL pública temporária (túnel automático).

### TikTok ⚠️ (rascunho até auditar)
1. [TikTok for Developers](https://developers.tiktok.com/) → novo app.
2. Adicione **Login Kit** e **Content Posting API**.
3. Redirect URI: `http://localhost:4310/oauth/tiktok/callback`
4. Copie *Client key* e *Client secret* → `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`.
> Apps não auditados só postam como **privado/rascunho**. Público em massa exige
> auditoria da TikTok (leva dias). A estrutura já está pronta para quando liberar.

### Kwai ❌ (manual)
Kwai não tem API pública de postagem. A plataforma **exporta** os vídeos para
`data/output/kwai/` e você posta manualmente pelo app do Kwai.

---

## 3. Subir pro GitHub (opcional, recomendado privado)

O `gh` não estava instalado/autenticado aqui, então o repositório está só local.
Para subir (privado):

```bash
# instale o GitHub CLI (https://cli.github.com) e faça: gh auth login
gh repo create projeto-dark --private --source=. --remote=origin --push
```

Ou crie um repo vazio no site e:

```bash
git remote add origin git@github.com:SEU_USUARIO/projeto-dark.git
git push -u origin main
```

---

## Estrutura

Veja **CLAUDE.md** para o mapa completo de pastas e o que cada arquivo faz.
