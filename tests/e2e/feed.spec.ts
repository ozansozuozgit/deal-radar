import { expect, test } from '@playwright/test'

test('setup → feed → search → sheet → list', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder(/start typing your address/i).fill('350 5th Ave, New York, NY')
  // let the suggestion dropdown settle, then submit via the button (manual path)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /show my deals/i }).click()

  await expect(page.getByPlaceholder(/search deals/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.grid > button').first()).toBeVisible({ timeout: 15_000 })

  // search narrows results
  await page.getByPlaceholder(/search deals/i).fill('chicken')
  await expect(page.locator('.grid > button').first()).toContainText(/chicken/i, { timeout: 15_000 })

  // sort control exists and switches
  await page.getByLabel('Sort').selectOption('price')
  await expect(page.locator('.grid > button').first()).toBeVisible({ timeout: 15_000 })

  // deal sheet opens with actions
  await page.locator('.grid > button').first().click()
  await expect(page.getByRole('button', { name: /add to list/i })).toBeVisible()
  await page.getByRole('button', { name: /add to list/i }).click()
  await page.keyboard.press('Escape') // closes the sheet
  await expect(page.getByRole('button', { name: /add to list/i })).toBeHidden()

  // list tab shows the added item with comparison data
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(page.getByText(/where to shop|no current deal|best:/i).first()).toBeVisible({ timeout: 15_000 })
})
