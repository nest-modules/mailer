import type { Adapter } from './renderers';

export const defaultContext = JSON.stringify(
  {
    name: 'John Doe',
    email: 'john@example.com',
    code: 'ABC123',
    items: [
      { name: 'Plan Pro', price: '$9.99' },
      { name: 'Extra Storage', price: '$4.99' },
    ],
  },
  null,
  2,
);

const emailStyles = `
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
    .header { background: #e0234e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; }
    .content { padding: 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
    .code { background: #f5f5f5; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 24px; text-align: center; letter-spacing: 4px; margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px 12px; border-bottom: 1px solid #eee; text-align: left; }
    th { background: #f9f9f9; font-weight: 600; }
    .btn { display: inline-block; background: #e0234e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 12px 0; }
    .footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; }`;

export const adapters: Record<
  Adapter,
  { label: string; defaultTemplate: string }
> = {
  handlebars: {
    label: 'Handlebars',
    defaultTemplate: `<!DOCTYPE html>
<html>
<head><style>${emailStyles}</style></head>
<body>
  <div class="header">
    <h1>Welcome, {{name}}!</h1>
  </div>
  <div class="content">
    <p>Hello <strong>{{name}}</strong>,</p>
    <p>Your account (<em>{{email}}</em>) has been created.</p>
    <p>Your verification code:</p>
    <div class="code">{{code}}</div>
    <h3>Your Plan</h3>
    <table>
      <thead><tr><th>Item</th><th>Price</th></tr></thead>
      <tbody>
        {{#each items}}
        <tr><td>{{this.name}}</td><td>{{this.price}}</td></tr>
        {{/each}}
      </tbody>
    </table>
    <a href="#" class="btn">Get Started</a>
    <p>Thanks for joining us!</p>
  </div>
  <div class="footer">
    <p>&copy; 2025 NestJS Mailer. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  ejs: {
    label: 'EJS',
    defaultTemplate: `<!DOCTYPE html>
<html>
<head><style>${emailStyles}</style></head>
<body>
  <div class="header">
    <h1>Welcome, <%= name %>!</h1>
  </div>
  <div class="content">
    <p>Hello <strong><%= name %></strong>,</p>
    <p>Your account (<em><%= email %></em>) has been created.</p>
    <p>Your verification code:</p>
    <div class="code"><%= code %></div>
    <h3>Your Plan</h3>
    <table>
      <thead><tr><th>Item</th><th>Price</th></tr></thead>
      <tbody>
        <% items.forEach(function(item) { %>
        <tr><td><%= item.name %></td><td><%= item.price %></td></tr>
        <% }); %>
      </tbody>
    </table>
    <a href="#" class="btn">Get Started</a>
    <p>Thanks for joining us!</p>
  </div>
  <div class="footer">
    <p>&copy; 2025 NestJS Mailer. All rights reserved.</p>
  </div>
</body>
</html>`,
  },
  pug: {
    label: 'Pug',
    defaultTemplate: `doctype html
html
  head
    style.
      ${emailStyles.split('\n').join('\n      ')}
  body
    .header
      h1 Welcome, #{name}!
    .content
      p Hello #[strong #{name}],
      p Your account (#[em #{email}]) has been created.
      p Your verification code:
      .code #{code}
      h3 Your Plan
      table
        thead
          tr
            th Item
            th Price
        tbody
          each item in items
            tr
              td #{item.name}
              td #{item.price}
      a.btn(href="#") Get Started
      p Thanks for joining us!
    .footer
      p &copy; 2025 NestJS Mailer. All rights reserved.`,
  },
};
