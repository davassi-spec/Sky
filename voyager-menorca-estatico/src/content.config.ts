import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const lang = z.enum(['es', 'ca', 'en', 'fr']);
const faq = z.array(z.object({ q: z.string(), a: z.array(z.string()) }));

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    url: z.string(),
    lang,
    translationKey: z.string(),
    template: z.enum(['home', 'tour', 'excursiones', 'contacto', 'about', 'page']),
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    noindex: z.boolean().default(false),
    // Fichas de excursión
    tourOrder: z.number().optional(),
    eyebrow: z.string().optional(),
    tagline: z.string().optional(),
    badge: z.string().optional(),
    intro: z.array(z.string()).optional(),
    facts: z.array(z.object({ value: z.string(), label: z.string().default('') })).optional(),
    price: z.object({ from: z.boolean().default(false), amount: z.string(), note: z.string().default('') }).optional(),
    gallery: z.array(z.string()).optional(),
    reviews: z.array(z.object({ text: z.string() })).optional(),
    faq: faq.optional(),
    turitop: z.string().optional(), // código de inserción de Turitop (HTML) de esta excursión
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    url: z.string(),
    lang,
    translationKey: z.string(),
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string().optional(),
    date: z.string().optional(),
    updated: z.string().optional(),
    image: z.string().optional(),
    categories: z.array(z.string()).default([]),
  }),
});

export const collections = { pages, posts };
