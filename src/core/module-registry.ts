import { createElement, type ComponentType } from 'react'
import ReadingsModule from '../modules/readings/ReadingsModule'
import StudyModule from '../modules/study/StudyModule'
import WritingModule from '../modules/writing/WritingModule'
import ChineseWorkspace from '../experiences/chinese/ChineseWorkspace'

export type ModuleKind = 'module' | 'experience'
export type OrbeModule = {
  id: string
  name: string
  kind: ModuleKind
  component: ComponentType
  enabledByDefault: boolean
  exposedInNavigation: boolean
  uses?: string[]
}

export const moduleRegistry: OrbeModule[] = [
  {
    id: 'readings',
    name: 'Leituras',
    kind: 'module',
    component: ReadingsModule,
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'study',
    name: 'Flashcards',
    kind: 'module',
    component: StudyModule,
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'writing',
    name: 'Escrita',
    kind: 'module',
    component: () => createElement(WritingModule, { items: [] }),
    enabledByDefault: true,
    exposedInNavigation: false,
  },
  {
    id: 'chinese',
    name: 'Chinês',
    kind: 'experience',
    component: ChineseWorkspace,
    enabledByDefault: true,
    exposedInNavigation: true,
    uses: ['readings', 'study', 'writing'],
  },
]
