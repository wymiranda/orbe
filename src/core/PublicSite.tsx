import { useEffect, useState } from 'react'
import '../App.css'

type PublicPage = 'home' | 'privacy' | 'terms' | 'policies' | 'litra'
const policyApps = [{ name: 'Litra', description: 'Leitor offline de PDF, EPUB, TXT e Markdown para Android.', href: '/politicas/litra', updatedAt: '27 de outubro de 2026' }]

function Contact() {
  const [email, setEmail] = useState('')
  useEffect(() => { void fetch('/api/public/contact').then(async (response) => response.ok ? response.json() as Promise<{ email?: string }> : {}).then((data: { email?: string }) => setEmail(data.email ?? '')).catch(() => {}) }, [])
  return <section className="policy-contact" aria-labelledby="contato"><h2 id="contato">Contato</h2>{email ? <p>Para dúvidas sobre esta política, entre em contato por <a href={`mailto:${email}`}>{email}</a>.</p> : <p>Para dúvidas sobre esta política, entre em contato pelo e-mail de suporte informado pelo administrador.</p>}</section>
}

function Policies() {
  return <main className="policy-page"><header className="policy-header"><a className="brand" href="/" aria-label="niorb, início">niorb</a><nav aria-label="Navegação pública"><a href="/">Início</a></nav></header><section className="policy-intro"><p className="eyebrow">CENTRAL PÚBLICA</p><h1>Políticas</h1><p>Políticas de privacidade e informações de tratamento de dados dos aplicativos Niorb.</p></section><section className="policy-app-list" aria-label="Aplicativos"><h2>Aplicativos</h2><ul>{policyApps.map((app) => <li key={app.name}><div><h3>{app.name}</h3><p>{app.description}</p><small>Atualizado em {app.updatedAt}</small></div><a href={app.href}>Ver política</a></li>)}</ul></section></main>
}

function LitraPolicy() {
  return <main className="policy-page"><header className="policy-header"><a className="brand" href="/" aria-label="niorb, início">niorb</a><nav aria-label="Navegação pública"><a href="/politicas">Políticas</a><a href="/">Início</a></nav></header><article className="policy-article"><p className="eyebrow">LITRA</p><h1>Política de privacidade</h1><p className="policy-updated">Última atualização: 27 de outubro de 2026</p><section><h2>Visão geral</h2><p>O Litra é um leitor offline de PDF, EPUB, TXT e Markdown para Android. Ele não possui conta, anúncios, analytics, sincronização ou backend.</p></section><section><h2>Dados no dispositivo</h2><p>Os documentos selecionados, seus metadados, a posição de leitura e as preferências ficam somente no armazenamento privado do dispositivo.</p><p>O Litra não transmite, vende ou compartilha arquivos ou dados do usuário.</p></section><section><h2>Acesso a arquivos e permissões</h2><p>A importação usa o seletor nativo de arquivos do Android e não exige acesso amplo ao armazenamento.</p><p>O app não solicita acesso a fotos, contatos, localização, câmera, microfone ou identificadores de publicidade.</p></section><section><h2>Exclusão de dados</h2><p>Você pode excluir documentos da biblioteca. Ao desinstalar o app, os dados privados locais são removidos pelo Android.</p></section><section><h2>Renderização de EPUB</h2><p>Para renderizar EPUB, o app pode usar um servidor local temporário acessível apenas no próprio dispositivo. Nenhum arquivo é enviado à internet.</p></section><Contact /></article></main>
}

export default function PublicSite({ privacy = false, terms = false, page = 'home' }: { privacy?: boolean; terms?: boolean; page?: PublicPage }) {
  useEffect(() => { document.title = page === 'litra' ? 'Política de privacidade do Litra | Niorb' : page === 'policies' ? 'Políticas | Niorb' : 'Niorb' }, [page])
  if (page === 'policies') return <Policies />
  if (page === 'litra') return <LitraPolicy />
  if (terms) return <main className="public-page"><a className="brand" href="/app">niorb</a><h1>Termos de serviço</h1><p>O niorb é uma ferramenta pessoal de estudo. Ao utilizar o app, você é responsável pelo conteúdo que adiciona e pelo uso da sua conta.</p><p>O serviço está em fase beta, sem garantia de disponibilidade contínua ou preservação permanente dos dados. Podemos atualizar funcionalidades e estes termos conforme o produto evolui.</p><p>Não é permitido usar o niorb para conteúdo ilegal, violação de direitos autorais ou tentativa de comprometer a segurança do serviço.</p><a href="/app">Voltar à página inicial</a></main>
  if (privacy) return <main className="public-page"><a className="brand" href="/app">niorb</a><h1>Política de privacidade</h1><p>O niorb guarda o e-mail informado no acesso e o conteúdo compartilhado da plataforma, como leituras e catálogo de vocabulário.</p><p>Seu progresso de estudo, cards e revisões permanecem no dispositivo em que você usa o app. Não vendemos dados pessoais nem os compartilhamos para publicidade.</p><p>Você pode solicitar a exclusão da sua conta pelo contato do desenvolvedor.</p><a href="/app">Voltar à página inicial</a></main>
  return <main className="public-page"><a className="brand" href="/">niorb</a><p className="eyebrow">SEU ESPAÇO DE ESTUDO</p><h1>Aprenda no seu próprio ritmo.</h1><p>niorb reúne leituras em chinês, vocabulário e flashcards em um espaço pessoal de estudo.</p><a className="google-login" href="/app">Entrar no niorb</a><footer><a href="/privacidade">Política de privacidade</a><a href="/termos">Termos de serviço</a><a href="/politicas">Políticas</a></footer></main>
}
