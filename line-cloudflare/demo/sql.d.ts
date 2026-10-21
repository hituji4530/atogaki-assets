declare module '*.sql' {
  const text: string;
  export default text;
}

// scripts/build.mjs が migrations/*.sql をつないで渡す
declare module 'virtual:schema' {
  const text: string;
  export default text;
}
