import { useState } from 'react'
import type { FlashcardDashboardContext } from '../../../modules/study/flashcard-source'
import { chineseProgressStore, type OfflineVocabulary } from '../device-progress'

/* Chinese parts of the flashcard dashboard, below the shared metrics. */

/** Adds every word of one HSK level to the deck at once. */
export function HskBulkAdd({ vocabulary, progress, refresh }: FlashcardDashboardContext<OfflineVocabulary>) {
  const [selectedHskLevel, setSelectedHskLevel] = useState('')
  const [bulkAddMessage, setBulkAddMessage] = useState('')
  const hskLevels = [...new Set(vocabulary.map((item) => item.hsk_level))].sort((first, second) => Number(first) - Number(second))
  const selectedHskVocabulary = vocabulary.filter((item) => item.hsk_level === selectedHskLevel)
  const existingVocabularyIds = new Set(progress.cards.map((card) => card.vocabularyId))
  const cardsToAdd = selectedHskVocabulary.filter((item) => !existingVocabularyIds.has(item.id))
  function addHskLevel() {
    if (!selectedHskLevel) return
    const added = chineseProgressStore.createCardsForVocabulary(chineseProgressStore.load(), selectedHskVocabulary.map((item) => item.id))
    refresh()
    setBulkAddMessage(added ? `${added} ${added === 1 ? 'card foi adicionado' : 'cards foram adicionados'} do HSK ${selectedHskLevel}.` : `Todos os cards do HSK ${selectedHskLevel} já estão no seu baralho.`)
  }
  return <section className="bulk-card-add" aria-labelledby="bulk-card-add-title"><div><p className="eyebrow">ADICIONAR EM LOTE</p><h2 id="bulk-card-add-title">Estude um HSK inteiro</h2><p>Inclua todos os termos de um nível no seu baralho de uma vez.</p></div><div className="bulk-card-controls"><label>Nível HSK<select value={selectedHskLevel} onChange={(event) => { setSelectedHskLevel(event.target.value); setBulkAddMessage('') }}><option value="">Escolha um nível</option>{hskLevels.map((level) => <option key={level} value={level}>HSK {level}</option>)}</select></label><button type="button" onClick={addHskLevel} disabled={!selectedHskLevel || !cardsToAdd.length}>Adicionar {selectedHskLevel ? `HSK ${selectedHskLevel}` : 'cards'}</button></div>{selectedHskLevel && <p className="bulk-card-status">{cardsToAdd.length ? `${cardsToAdd.length} de ${selectedHskVocabulary.length} termos serão adicionados.` : `Todos os ${selectedHskVocabulary.length} termos deste nível já estão no seu baralho.`}</p>}{bulkAddMessage && <p className="bulk-card-status" role="status">{bulkAddMessage}</p>}</section>
}

export function StudyOptions({ canStudy, startSession, learningCount, newCount }: FlashcardDashboardContext<OfflineVocabulary>) {
  return <section className="study-options" aria-labelledby="study-options-title"><h2 id="study-options-title">Opções de estudo</h2><div><article><span className="study-option-icon play">▷</span><h3>Revisão inteligente</h3><p>Veja os cards que precisam ser revisados agora.</p><button type="button" onClick={startSession} disabled={!canStudy}>Revisar agora →</button></article><article><span className="study-option-icon bolt">ϟ</span><h3>Estudo focado</h3><p>Adicione um HSK inteiro ou escolha um nível para praticar.</p><a href="#adicionar-hsk">Escolher tema</a></article><article><span className="study-option-icon shuffle">↝</span><h3>Seu baralho</h3><p>{learningCount} itens em aprendizagem e {newCount} novos para conhecer.</p><a href="#seu-baralho">Ver baralho</a></article></div></section>
}
