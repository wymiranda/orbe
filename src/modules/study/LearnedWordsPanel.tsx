import { useEffect, useState } from 'react'
import '../../App.css'
import { createCardsForVocabulary, loadDeviceProgress, loadOfflineVocabulary, recordStudyActivity, removeCard, saveDeviceProgress, saveOfflineVocabulary, setCardLearned, setVocabularyLearned, unsetVocabularyLearned, type DeviceProgress, type OfflineVocabulary } from '../../experiences/chinese/device-progress'
import { declareModuleKnowledge } from '../../learning-paths/module-bridge'

const learnedWordsPageSize = 25
function normalizedPinyin(value: string) { return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().trim() }

export function LearnedWordsPanel() {
  const [progress, setProgress] = useState<DeviceProgress>(() => loadDeviceProgress())
  const [vocabulary, setVocabulary] = useState<OfflineVocabulary[]>(() => loadOfflineVocabulary())
  const [selectedLearnedWord, setSelectedLearnedWord] = useState('')
  const [learnedWordsPinyinFilter, setLearnedWordsPinyinFilter] = useState('')
  const [learnedWordsPage, setLearnedWordsPage] = useState(0)

  useEffect(() => {
    // The catalogue is cached by the flashcards screen; refresh it here too so
    // the list works even when that screen was never opened on this device.
    void fetch('/api/chinese/vocabulary').then(async (response) => {
      if (!response.ok) return
      const catalogue = await response.json() as OfflineVocabulary[]
      saveOfflineVocabulary(catalogue)
      setVocabulary(catalogue)
    }).catch(() => undefined)
    const refresh = () => setProgress(loadDeviceProgress())
    const refreshVocabulary = () => setVocabulary(loadOfflineVocabulary())
    window.addEventListener('niorb:chinese-progress', refresh)
    window.addEventListener('niorb:chinese-vocabulary', refreshVocabulary)
    return () => { window.removeEventListener('niorb:chinese-progress', refresh); window.removeEventListener('niorb:chinese-vocabulary', refreshVocabulary) }
  }, [])

  const learnedWords = vocabulary.filter((item) => progress.vocabulary[item.id] === 'learned').sort((left, right) => left.hanzi.localeCompare(right.hanzi, 'zh-Hans'))
  const availableLearnedWords = vocabulary.filter((item) => progress.vocabulary[item.id] !== 'learned').sort((left, right) => left.hanzi.localeCompare(right.hanzi, 'zh-Hans'))
  const filteredLearnedWords = learnedWords.filter((item) => normalizedPinyin(item.pinyin).includes(normalizedPinyin(learnedWordsPinyinFilter)))
  const learnedWordsPageCount = Math.max(1, Math.ceil(filteredLearnedWords.length / learnedWordsPageSize))
  const activeLearnedWordsPage = Math.min(learnedWordsPage, learnedWordsPageCount - 1)
  const visibleLearnedWords = filteredLearnedWords.slice(activeLearnedWordsPage * learnedWordsPageSize, (activeLearnedWordsPage + 1) * learnedWordsPageSize)

  function addLearnedWord() {
    if (!selectedLearnedWord) return
    createCardsForVocabulary(loadDeviceProgress(), [selectedLearnedWord])
    const nextProgress = loadDeviceProgress()
    if (nextProgress.vocabulary[selectedLearnedWord] !== 'learned') recordStudyActivity(nextProgress, { learned: 1 })
    setVocabularyLearned(nextProgress, selectedLearnedWord)
    setCardLearned(nextProgress, selectedLearnedWord)
    saveDeviceProgress(nextProgress)
    void declareModuleKnowledge(selectedLearnedWord, 'known')
    setSelectedLearnedWord('')
  }
  function removeLearnedWord(vocabularyId: string) {
    const nextProgress = loadDeviceProgress()
    unsetVocabularyLearned(nextProgress, vocabularyId)
    removeCard(nextProgress, vocabularyId)
    saveDeviceProgress(nextProgress)
  }

  return <section className="study-deck-preview learned-words" id="palavras-aprendidas"><header><div><h2>Palavras aprendidas</h2><p>{learnedWords.length} {learnedWords.length === 1 ? 'palavra na sua lista' : 'palavras na sua lista'}</p></div></header><div className="learned-words-controls"><div className="learned-words-add"><select value={selectedLearnedWord} onChange={(event) => setSelectedLearnedWord(event.target.value)} aria-label="Adicionar palavra aprendida"><option value="">Adicionar uma palavra</option>{availableLearnedWords.map((item) => <option key={item.id} value={item.id}>{item.hanzi} · {item.pinyin} · {item.portuguese}</option>)}</select><button type="button" onClick={addLearnedWord} disabled={!selectedLearnedWord}>Adicionar</button></div><label className="learned-words-filter">Filtrar por pinyin<input value={learnedWordsPinyinFilter} onChange={(event) => { setLearnedWordsPinyinFilter(event.target.value); setLearnedWordsPage(0) }} placeholder="Ex.: he, cha, wo" /></label></div>{filteredLearnedWords.length ? <><ul>{visibleLearnedWords.map((item) => <li key={item.id}><strong>{item.hanzi}</strong><span>{item.pinyin} · {item.portuguese}</span><small>HSK {item.hsk_level}</small><button type="button" className="secondary" onClick={() => removeLearnedWord(item.id)}>Remover</button></li>)}</ul>{learnedWordsPageCount > 1 && <nav className="learned-words-pagination" aria-label="Páginas de palavras aprendidas"><button type="button" className="secondary" disabled={activeLearnedWordsPage === 0} onClick={() => setLearnedWordsPage((page) => Math.max(0, page - 1))}>Anterior</button><span>{activeLearnedWordsPage + 1} de {learnedWordsPageCount}</span><button type="button" className="secondary" disabled={activeLearnedWordsPage + 1 === learnedWordsPageCount} onClick={() => setLearnedWordsPage((page) => Math.min(learnedWordsPageCount - 1, page + 1))}>Próxima</button></nav>}</> : <p className="empty">{learnedWords.length ? 'Nenhuma palavra encontrada para esse pinyin.' : 'Sua lista de palavras aprendidas aparecerá aqui.'}</p>}</section>
}
