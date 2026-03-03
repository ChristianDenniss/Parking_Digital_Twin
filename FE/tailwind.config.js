/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // University of New Brunswick brand (unb.ca)
        unb: {
          red: "#D22B43",
          "red-dark": "#b8243a",
          black: "#000000",
        },
      },
    },
  },
  plugins: [],
};
