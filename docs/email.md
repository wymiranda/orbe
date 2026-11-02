# E-mail transacional

O Niorb envia e-mail por uma camada própria em `worker/modules/email/service.ts`.
Hoje ela usa a API HTTP da Brevo, mas os fluxos do produto não conhecem a API da
Brevo diretamente. Trocar de provedor exige alterar somente essa camada.

O serviço não salva destinatários, conteúdo ou logs de e-mail no D1. A Brevo é
quem processa o envio e mantém os registros operacionais dela.

## Configuração local

Copie os campos de `.dev.vars.example` para `.dev.vars` e preencha a chave.
Esse arquivo é ignorado pelo Git e nunca deve receber valores de produção em um
commit.

## Configuração de produção

Depois de verificar o domínio remetente no painel da Brevo, cadastre os valores
como secrets do Worker, um por vez:

```powershell
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put EMAIL_SENDER_NAME
npx wrangler secret put EMAIL_REPLY_TO
```

`EMAIL_FROM` e `EMAIL_REPLY_TO` recebem somente o endereço, por exemplo
`contato@seudominio.com`. `EMAIL_SENDER_NAME` recebe algo como `Niorb`.

Após um deploy autorizado, um administrador autenticado pode confirmar a
configuração com `POST /api/email/test`. O teste só envia para o próprio e-mail
do administrador; a rota não aceita destinatário no corpo da requisição.
