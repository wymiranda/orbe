import { createStudySync } from '../../modules/study/engine/study-sync'
import { chineseProgressStore } from './device-progress'

const chineseStudySync = createStudySync(chineseProgressStore, '/api/study/progress')

export const syncStudyProgress = chineseStudySync.sync
export const startStudySync = chineseStudySync.start
