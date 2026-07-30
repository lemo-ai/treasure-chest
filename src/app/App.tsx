import { RouterProvider } from 'react-router'
import { router } from './router'

export function App(): React.JSX.Element {
  return <RouterProvider router={router} />
}
