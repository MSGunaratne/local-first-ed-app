import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './src/features/**/*.schema.ts',
  dialect: 'sqlite',
})
