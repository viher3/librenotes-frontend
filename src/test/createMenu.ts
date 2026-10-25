import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Picks an entry of the sidebar's "+" menu (Create new → New document / New link / New folder). */
export async function createFromSidebar(user: UserEvent, item: string, trigger = 'Create new') {
  await user.click(await screen.findByRole('button', { name: trigger }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

/** Opens the account dialog from the sidebar's user button. */
export async function openAccount(user: UserEvent, username = 'ada') {
  await user.click(await screen.findByRole('button', { name: `Account options for ${username}` }))
}
