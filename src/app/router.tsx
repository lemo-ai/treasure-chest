import { createHashRouter } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { CalendarPage } from '@renderer/features/calendar/pages/CalendarPage'
import { CalendarWidgetPage } from '@renderer/features/calendar/pages/CalendarWidgetPage'
import { FortunePage } from '@renderer/features/fortune/pages/FortunePage'
import { StocksPage } from '@renderer/features/stocks/pages/StocksPage'
import { SettingsPage } from '@renderer/features/settings/pages/SettingsPage'
import { WorkbenchPage } from '@renderer/features/workbench/pages/WorkbenchPage'
import { KnowledgePage } from '@renderer/features/knowledge/pages/KnowledgePage'
import { ChangelogPage } from '@renderer/features/changelog/pages/ChangelogPage'
import { ToolsHubPage } from '@renderer/features/tools/pages/ToolsHubPage'
import { TimestampPage } from '@renderer/features/tools/pages/TimestampPage'
import { TimezonePage } from '@renderer/features/tools/pages/TimezonePage'
import { WorldTimePage } from '@renderer/features/tools/pages/WorldTimePage'
import { JsonPage } from '@renderer/features/tools/pages/JsonPage'
import { ImageToolkitPage } from '@renderer/features/tools/pages/ImageToolkitPage'
import { VideoToolkitPage } from '@renderer/features/tools/pages/VideoToolkitPage'
import { AudioToolkitPage } from '@renderer/features/tools/pages/AudioToolkitPage'
import { DocToolkitPage } from '@renderer/features/tools/pages/DocToolkitPage'

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
      { path: 'tools', element: <ToolsHubPage /> },
      { path: 'tools/timestamp', element: <TimestampPage /> },
      { path: 'tools/timezone', element: <TimezonePage /> },
      { path: 'tools/worldtime', element: <WorldTimePage /> },
      { path: 'tools/json', element: <JsonPage /> },
      { path: 'tools/image', element: <ImageToolkitPage /> },
      { path: 'tools/video', element: <VideoToolkitPage /> },
      { path: 'tools/audio', element: <AudioToolkitPage /> },
      { path: 'tools/doc', element: <DocToolkitPage /> },
      { path: 'fortune', element: <FortunePage /> },
      { path: 'stocks', element: <StocksPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'changelog', element: <ChangelogPage /> },
    ],
  },
])
