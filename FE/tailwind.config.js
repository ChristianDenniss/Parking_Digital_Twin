/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // University of New Brunswick brand (unb.ca); UNBSJ red (darker than primary #D22B43)
        unb: {
          red: "#9E1E32",
          "red-dark": "#7E1828",
          black: "#000000",
        },
      },
    },
  },
  plugins: [],
};
