import type { Page } from 'playwright';

export type FieldType = 'text' | 'email' | 'textarea' | 'select' | 'checkbox' | 'radio';

export interface FormField {
  selector: string;
  value: string;
  type?: FieldType;
  label?: string; // for logging only
}

// Fills a set of fields on a page with human-like timing.
export async function fillForm(page: Page, fields: FormField[]): Promise<void> {
  for (const field of fields) {
    try {
      await page.waitForSelector(field.selector, { timeout: 5_000, state: 'visible' });

      switch (field.type ?? 'text') {
        case 'text':
        case 'email':
          await page.click(field.selector);
          await page.waitForTimeout(80 + Math.random() * 120);
          await page.fill(field.selector, '');
          await humanType(page, field.selector, field.value);
          break;

        case 'textarea':
          await page.click(field.selector);
          await page.waitForTimeout(100 + Math.random() * 150);
          await page.fill(field.selector, '');
          await humanType(page, field.selector, field.value);
          break;

        case 'select':
          await page.selectOption(field.selector, field.value);
          break;

        case 'checkbox':
          if (field.value === 'true') {
            await page.check(field.selector);
          } else {
            await page.uncheck(field.selector);
          }
          break;

        case 'radio':
          await page.click(`${field.selector}[value="${field.value}"]`);
          break;
      }

      // Inter-field pause
      await page.waitForTimeout(150 + Math.random() * 250);
    } catch (err) {
      // Field not found — skip gracefully
      process.stderr.write(`[FormFill] Could not fill "${field.label ?? field.selector}": ${String(err)}\n`);
    }
  }
}

// Clicks a submit button and waits for navigation.
export async function submitForm(
  page: Page,
  submitSelector: string,
): Promise<{ success: boolean; finalUrl: string }> {
  try {
    await page.click(submitSelector);
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    return { success: true, finalUrl: page.url() };
  } catch (err) {
    process.stderr.write(`[FormFill/Submit] ${String(err)}\n`);
    return { success: false, finalUrl: page.url() };
  }
}

// Types text character-by-character with randomised delays (human-like).
async function humanType(page: Page, selector: string, text: string): Promise<void> {
  for (const char of text) {
    await page.type(selector, char, { delay: 40 + Math.random() * 80 });
  }
}

// Builds standard job application fields from soul identity.
export function buildApplicationFields(params: {
  fullName: string;
  email: string;
  coverLetter?: string;
  resumeText?: string;
}): FormField[] {
  const fields: FormField[] = [
    { selector: 'input[name*="name"], input[placeholder*="name" i]',     type: 'text',  value: params.fullName,     label: 'name' },
    { selector: 'input[type="email"], input[name*="email"]',              type: 'email', value: params.email,        label: 'email' },
  ];

  if (params.coverLetter) {
    fields.push({
      selector: 'textarea[name*="cover"], textarea[placeholder*="cover" i], textarea[name*="message"]',
      type:     'textarea',
      value:    params.coverLetter,
      label:    'cover letter',
    });
  }

  return fields;
}
