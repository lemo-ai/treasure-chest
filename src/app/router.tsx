import { createHashRouter } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { HomePage } from '@renderer/features/home/pages/HomePage'
import { CalendarPage } from '@renderer/features/calendar/pages/CalendarPage'
import { CalendarWidgetPage } from '@renderer/features/calendar/pages/CalendarWidgetPage'
import { FortunePage } from '@renderer/features/fortune/pages/FortunePage'
import { StocksPage } from '@renderer/features/stocks/pages/StocksPage'
import { SettingsPage } from '@renderer/features/settings/pages/SettingsPage'

export const router = createHashRouter([
  {
    path: '/calendar/widget',
    element: <CalendarWidgetPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'fortune', element: <FortunePage /> },
      { path: 'stocks', element: <StocksPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
