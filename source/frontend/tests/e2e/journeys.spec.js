import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

async function login(page, email, password = 'password123') {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: false }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
const summary = (page) => page.getByRole('region', { name: 'Summary', exact: true })
async function status(page, value) {
  await expect(summary(page).getByRole('definition').filter({ hasText: new RegExp(`^${value}$`) })).toBeVisible()
}
async function update(page, nextStatus, message) {
  await page.getByLabel('Update or comment').fill(message)
  await page.getByLabel('Who can see this').selectOption('public')
  await page.getByLabel('Change status').selectOption(nextStatus)
  await page.getByRole('button', { name: 'Post update', exact: true }).click()
}

test('requester submits; staff handles full lifecycle; requester sees public history after reload', async ({ page, browser }) => {
  await login(page, 'requester@example.com')
  await expect(page.getByRole('heading', { name: 'My requests', exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Submit a request', exact: true }).click()
  await page.getByRole('button', { name: 'Submit request', exact: true }).click()
  await expect(page.getByText('Select a category.', { exact: true }).first()).toBeVisible()
  await page.getByLabel('Category', { exact: false }).selectOption({ label: 'Other' })
  const description = `Browser streetlight fixture ${randomUUID()}`
  await page.getByLabel('Describe the problem').fill(description)
  await page.getByLabel('Explain what kind of problem this is').fill('Public lighting')
  await page.getByRole('button', { name: 'Submit request', exact: true }).click()
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}$/)
  const requestUrl = page.url()
  await expect(summary(page).getByText(description, { exact: true })).toBeVisible()
  await page.reload()
  await status(page, 'Submitted')

  const context = await browser.newContext({ baseURL: new URL('/', page.url()).href })
  try {
    const staff = await context.newPage()
    // Each context signs in through the UI, with no injected tokens or mocked routes.
    await staff.goto(new URL('/login', requestUrl).href)
    await login(staff, 'staff@example.com')
    await expect(staff.getByRole('heading', { name: 'Staff dashboard', exact: true })).toBeVisible()
    await staff.goto(requestUrl)
    await staff.getByRole('button', { name: 'Accept request' }).click()
    await expect(staff.getByLabel('Target completion date')).toHaveAttribute('aria-invalid', 'true')
    await expect(staff.getByText(/Choose a target date\./)).toBeVisible()
    await staff.getByLabel('Target completion date').fill('2030-12-31')
    await staff.getByRole('button', { name: 'Accept request' }).click()
    await status(staff, 'Accepted')
    await staff.getByLabel('Assign to').selectOption({ label: 'Sam Sum' })
    await staff.getByRole('button', { name: 'Save assignment' }).click()
    await status(staff, 'Assigned')
    await update(staff, 'in_progress', 'Inspection started in browser test.')
    await status(staff, 'In progress')
    const secretNote = `Internal fixture ${randomUUID()}`
    await staff.getByLabel('Update or comment').fill(secretNote)
    await staff.getByLabel('Who can see this').selectOption('internal')
    await staff.getByRole('button', { name: 'Post update', exact: true }).click()
    await expect(staff.getByText(secretNote, { exact: true })).toBeVisible()
    await page.reload()
    await status(page, 'In progress')
    await expect(page.getByText(secretNote, { exact: true })).toHaveCount(0)
    for (const [value, label, text] of [
      ['on_hold', 'On hold', 'Waiting for replacement.'],
      ['in_progress', 'In progress', 'Replacement arrived.'],
      ['resolved', 'Resolved', 'Light repaired.'],
      ['closed', 'Closed', 'Repair confirmed.'],
    ]) {
      await update(staff, value, text)
      await status(staff, label)
    }
    await expect(staff.getByText('This request is closed. No further actions are available.')).toBeVisible()
    await page.reload()
    await status(page, 'Closed')
    await expect(page.getByText('Repair confirmed.', { exact: true })).toBeVisible()
    await expect(page.getByText(secretNote, { exact: true })).toHaveCount(0)
  } finally { await context.close() }
})

test('admin creation, role changes, live-session revocation, reactivation and category visibility', async ({ page, browser }) => {
  const suffix = randomUUID().slice(0, 8)
  const name = `Browser User ${suffix}`
  const email = `browser-${suffix}@example.test`
  const password = 'Disposable-Browser-123!'
  const category = `Browser Category ${suffix}`
  await login(page, 'admin@example.com')
  await expect(page.getByRole('heading', { name: 'Admin management', exact: true })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'admin@example.com' }).getByRole('button', { name: /Deactivate/ })).toBeDisabled()
  const form = page.getByRole('form', { name: 'Add a user' })
  await form.getByLabel('Full name').fill(name)
  await form.getByLabel('Email address').fill(email)
  await form.getByLabel('Initial password').fill(password)
  await form.getByRole('button', { name: 'Add user', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: email })
  await expect(row).toBeVisible()
  await expect(form.getByLabel('Initial password')).toHaveValue('')
  await page.reload()
  await expect(row.getByText('Active', { exact: true })).toBeVisible()

  const context = await browser.newContext({ baseURL: new URL('/', page.url()).href })
  try {
    const user = await context.newPage()
    await user.goto(new URL('/login', page.url()).href)
    await login(user, email, password)
    await expect(user.getByRole('heading', { name: 'My requests', exact: true })).toBeVisible()
    await row.getByRole('combobox').selectOption('staff')
    await row.getByRole('button', { name: /Save role/ }).click()
    await expect(page.getByText(`Role updated for ${name}.`, { exact: true })).toBeVisible()
    await user.reload()
    await expect(user.getByRole('heading', { name: 'Your session has ended' })).toBeVisible()
    await user.getByRole('button', { name: 'Sign in again' }).click()
    await login(user, email, password)
    await expect(user.getByRole('heading', { name: 'Staff dashboard', exact: true })).toBeVisible()
    await row.getByRole('button', { name: /^Deactivate/ }).click()
    await expect(row.getByText('Deactivated', { exact: true })).toBeVisible()
    await user.reload()
    await expect(user.getByRole('heading', { name: 'Your session has ended' })).toBeVisible()
    await user.getByRole('button', { name: 'Sign in again' }).click()
    await login(user, email, password)
    await expect(user.getByRole('alert')).toContainText('The email address or password is incorrect.')
    await row.getByRole('button', { name: /^Reactivate/ }).click()
    await expect(row.getByText('Active', { exact: true })).toBeVisible()
    await row.getByRole('combobox').selectOption('requester')
    await row.getByRole('button', { name: /Save role/ }).click()
    await expect(page.getByText(`Role updated for ${name}.`, { exact: true })).toBeVisible()
    await login(user, email, password)
    await expect(user.getByRole('heading', { name: 'My requests', exact: true })).toBeVisible()

    await page.getByLabel('Category name').fill(category)
    await page.getByRole('button', { name: 'Add category', exact: true }).click()
    const categoryRow = page.getByRole('row').filter({ hasText: category })
    await expect(categoryRow).toBeVisible()
    await user.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Submit a request', exact: true }).click()
    await expect(user.getByLabel('Category').getByRole('option', { name: category, exact: true })).toHaveCount(1)
    await categoryRow.getByRole('button', { name: /^Deactivate/ }).click()
    await expect(categoryRow.getByText('Deactivated', { exact: true })).toBeVisible()
    await user.reload()
    await expect(user.getByLabel('Category').getByRole('option', { name: 'Other', exact: true })).toHaveCount(1)
    await expect(user.getByLabel('Category').getByRole('option', { name: category, exact: true })).toHaveCount(0)
    await categoryRow.getByRole('button', { name: /^Reactivate/ }).click()
    await expect(categoryRow.getByText('Available to residents')).toBeVisible()
    await user.reload()
    await expect(user.getByLabel('Category').getByRole('option', { name: category, exact: true })).toHaveCount(1)
  } finally { await context.close() }
})

test('management summary survives refresh and blocks request-detail navigation', async ({ page }) => {
  await login(page, 'management@example.com')
  await expect(page.getByRole('heading', { name: 'Management dashboard', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Requests by status', exact: true })).toBeVisible()
  const overview = page.getByRole('region', { name: 'Overview', exact: true })
  const before = await overview.innerText()
  await page.reload()
  await expect(overview).toHaveText(before, { useInnerText: true })
  await page.goto('/requests/00000000-0000-4000-8000-000000000001')
  await expect(page.getByRole('heading', { name: 'You do not have access to this page' })).toBeVisible()
})
