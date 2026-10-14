import { test, expect } from '@playwright/test';

for (const path of ['/', '/about/']) {
  test(`footer Contribute link on ${path}`, async ({ page }) => {
    await page.goto(path);
    const link = page.locator('footer').getByRole('link', { name: 'Contribute' });
    await expect(link).toHaveAttribute('href', /\/blob\/main\/CONTRIBUTING\.md$/);
  });
}

test('about page contribute section has three links', async ({ page }) => {
  await page.goto('/about/');
  const links = page.locator('section.contribute a');
  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toHaveAttribute('href', /issues\/new\?template=new-pattern\.yml/);
  await expect(links.nth(1)).toHaveAttribute('href', /issues\/new\?template=correction\.yml/);
  await expect(links.nth(2)).toHaveAttribute('href', /CONTRIBUTING\.md$/);
});

test('pattern page has a correction link with the encoded name', async ({ page }) => {
  await page.goto('/patterns/agentic-rag/');
  const link = page.getByRole('link', { name: 'Suggest a correction' });
  const href = await link.getAttribute('href');
  expect(href).toContain('issues/new?template=correction.yml');
  expect(href).toContain('title=Correction%3A%20Agentic%20RAG');
  expect(new URL(href!).searchParams.get('url')).toMatch(/\/patterns\/agentic-rag\/$/);
});

test('families index links to the new-pattern form', async ({ page }) => {
  await page.goto('/families/');
  await expect(page.getByRole('link', { name: /Propose one/ })).toHaveAttribute('href', /issues\/new\?template=new-pattern\.yml/);
});
