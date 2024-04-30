# 01 Basic Mailer

This is a basic mailer application built with NestJS and the `@nestjs-modules/mailer` package.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js
- pnpm

### Installing

1. Clone the repository: `git clone https://github.com/nest-modules/mailer.git`
2. Navigate to the `01-basic-mailer` directory.
3. Install the dependencies: `pnpm install`

## Running the Application

- Run `pnpm run dev` for a dev server. The app will automatically reload if you change any of the source files.

## Running the Tests

- Run `pnpm test` to execute the unit tests via [Jest](https://jestjs.io/).
- Run `pnpm run test:e2e` to execute the end-to-end tests via [Jest](https://jestjs.io/).

## Environment Variables

The following environment variables are used in this application:

| Variable    | Description                       | Example Value                |
|-------------|-----------------------------------|------------------------------|
| `EMAIL_ID`  | The email ID for the mailer       | `example@example.com`        |
| `EMAIL_PASS`| The password for the email ID     | `your-email-password`        |

You can set these environment variables in a `.env` file in the root of your project. For example:

```env
EMAIL_ID=example@example.com
EMAIL_PASS=your-email-password
```

## Built With

- [NestJS](https://nestjs.com/) - A progressive Node.js framework for building efficient, reliable and scalable server-side applications.
- [@nestjs-modules/mailer](https://github.com/nest-modules/mailer) - A NestJS module for sending emails.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
