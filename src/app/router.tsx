import { createHashRouter } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { CalendarPage } from '@renderer/features/calendar/pages/CalendarPage'
import { CalendarWidgetPage } from '@renderer/features/calendar/pages/CalendarWidgetPage'
import { FortunePage } from '@renderer/features/fortune/pages/FortunePage'
import { StocksPage } from '@renderer/features/stocks/pages/StocksPage'
import { SettingsPage } from '@renderer/features/settings/pages/SettingsPage'
import { WorkbenchPage } from '@renderer/features/workbench/pages/WorkbenchPage'
import { KnowledgePage } from '@renderer/features/knowledge/pages/KnowledgePage'

export const router = createHashRouter([
  {
    path: '/calendar/widget',
    element: <CalendarWidgetPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <WorkbenchPage /> },
      { path: 'workbench', element: <WorkbenchPage /> },
      { path: 'knowledge', element: <KnowledgePage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'fortune', element: <FortunePage /> },
      { path: 'stocks', element: <StocksPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
