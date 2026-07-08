import './global.css';

export const metadata = {
  title: 'VSP Phone v4 Admin',
  description: 'VSP Phone v4 administration workspace',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
