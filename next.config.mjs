/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com", pathname: "/PokeAPI/**" },
      { protocol: "https", hostname: "pokeapi.co", pathname: "/**" },
    ],
  },
};

export default nextConfig;
