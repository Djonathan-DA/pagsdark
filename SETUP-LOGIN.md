# 🔐 Login dos usuários (Supabase + Google) — passo a passo

O PagsDark já vem com **tela de login pronta** (Google e e-mail+senha). Ela só
**liga** quando você preenche as 3 variáveis do Supabase no `.env`. Enquanto
estiverem vazias, o app roda em **modo local** (sem login), como antes.

> Por que Supabase? Ele já é o **banco de dados dos seus usuários** (guarda quem
> tem acesso, com senha/Google, de forma segura) e cuida do login com Google sem
> você precisar manter servidor de autenticação. É gratuito para começar.

---

## 1) Criar o projeto no Supabase
1. Acesse **https://supabase.com** e crie uma conta (pode entrar com o Google).
2. **New project** → dê um nome (ex.: `pagsdark`), defina uma senha de banco e crie.
3. Espere ~1 min até o projeto ficar pronto.

## 2) Pegar as 3 chaves
No projeto, vá em **Project Settings (engrenagem) → API** e copie:

| Variável no `.env`     | Onde fica no Supabase                         | Pode ser pública? |
|------------------------|-----------------------------------------------|-------------------|
| `SUPABASE_URL`         | **Project URL**                               | sim               |
| `SUPABASE_ANON_KEY`    | **Project API keys → `anon` `public`**        | sim               |
| `SUPABASE_JWT_SECRET`  | **JWT Settings → JWT Secret** (botão *Reveal*) | **NÃO — segredo** |

Cole no seu arquivo `.env`:
```
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_JWT_SECRET=seu-jwt-secret-aqui
```

## 3) Liberar o endereço do app (Redirect URLs)
Em **Authentication → URL Configuration**:
- **Site URL**: `http://localhost:4310`
- **Redirect URLs** (Add URL): `http://localhost:4310/login`

> Quando você empacotar como app desktop, o endereço continua sendo
> `http://localhost:4310` — então não muda nada aqui.

## 4) Ativar o login com Google
1. Em **Authentication → Providers → Google**, ligue o provider.
2. O Supabase mostra um **Callback URL** (algo como
   `https://xxxx.supabase.co/auth/v1/callback`). Copie.
3. No **Google Cloud Console** (https://console.cloud.google.com):
   - **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Tipo: **Web application**.
   - **Authorized redirect URIs**: cole o *Callback URL* do Supabase.
   - Crie e copie o **Client ID** e o **Client secret**.
4. De volta ao Supabase (provider Google), cole **Client ID** e **Client secret** e salve.

> Login por **e-mail+senha** já funciona sem o Google, assim que as 3 chaves do
> passo 2 estiverem no `.env`. O Google é opcional (mas recomendado).

## 5) Reiniciar o app
```
npm start          # ou: npm run app  (versão desktop)
```
Agora ao abrir `http://localhost:4310` você cai na **tela de login**. Entre com
Google ou crie uma conta por e-mail. Os usuários ficam salvos no Supabase.

---

## Como a segurança funciona aqui (resumo)
- O login acontece no Supabase; o app recebe um **token assinado (JWT)**.
- **O servidor valida a assinatura do token a cada requisição** (`src/auth.js`).
  Não dá para burlar pelo navegador — rotas e mídias ficam protegidas.
- O **JWT Secret nunca vai para o navegador** (só `URL` e `anon key`, que são
  públicas por design).
- Os **tokens das suas redes sociais** continuam cifrados no banco (AES-256-GCM).
- O servidor escuta **apenas em `127.0.0.1`** (não fica exposto na rede) e envia
  cabeçalhos de segurança (`X-Content-Type-Options`, `X-Frame-Options`, etc.).
- `.env`, banco e mídias estão no `.gitignore` — **não vão para o GitHub**.

## Quero isolar os dados por usuário (multiusuário de verdade)
Hoje o banco local (SQLite) é **um por instalação** — perfeito para uso pessoal
no seu Mac, com login controlando o acesso. Se mais tarde você quiser que cada
usuário tenha seus próprios workspaces/campanhas separados na **nuvem** (acessível
de qualquer lugar, agendador rodando 24/7), isso é um passo maior: migrar os dados
para o Supabase e hospedar o servidor. Dá para fazer — é só pedir.
