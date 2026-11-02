export type EnglishGame = 'bate-olho'

const games: { id: EnglishGame; title: string; description: string; image: string }[] = [
  { id: 'bate-olho', title: 'Bate-olho', description: 'Veja a palavra em inglês e escolha a imagem certa.', image: '/images/games/bate-olho-english.svg' },
]

export default function GamesHome({ onOpenGame }: { onOpenGame: (game: EnglishGame) => void }) {
  return <section className="welcome games-home"><p className="eyebrow">JOGAR</p><h1>Escolha um jogo.</h1><p className="intro">Pratique inglês em desafios rápidos.</p><div className="game-catalog games-home-grid">{games.map((game) => <article className="game-catalog-entry" key={game.id}><button type="button" className="game-catalog-card" onClick={() => onOpenGame(game.id)}><img className="game-catalog-image game-catalog-image-upload" src={game.image} alt={game.title} /><strong>{game.title}</strong><small>{game.description}</small></button></article>)}</div></section>
}
