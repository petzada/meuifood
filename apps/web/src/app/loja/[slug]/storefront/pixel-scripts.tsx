// Carrega o Pixel da Meta e a tag do Google SÓ da Loja visitada e só se configurados
// (Ticket 28). Sem `PageView` automático com dados do cliente: o `init`/`config` padrão
// das redes manda só a URL. Os eventos saem por `firePixelEvent`.
//
// Token do Pedido (Ticket 30): a URL da página do Pedido tem o token, que dá acesso a dados
// pessoais. Por isso:
// - a Meta não acompanha a navegação no navegador (`disablePushState`): sem `PageView`
//   automático numa troca de rota para a página do Pedido;
// - na página do Pedido (`safePagePath`), o `fbevents.js` NÃO carrega (o `purchase` vai por
//   imagem com a URL sem token, ver `firePixelEvent`) e o Google recebe `page_location` sem token.
import Script from "next/script";

import type { PixelIds } from "./pixels";

export function PixelScripts({
  pixels,
  safePagePath,
}: {
  pixels: PixelIds | null | undefined;
  /** Página com segredo na URL: caminho sem o segredo que os Pixels podem ver. */
  safePagePath?: string;
}) {
  if (!pixels || (!pixels.metaPixelId && !pixels.googleTagId)) return null;
  const googleConfig = safePagePath
    ? `,{page_location:location.origin+${JSON.stringify(safePagePath)},page_referrer:location.origin}`
    : "";
  return (
    <>
      {pixels.metaPixelId && !safePagePath ? (
        <Script id="foode-meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq.disablePushState=true;fbq('init',${JSON.stringify(pixels.metaPixelId)});fbq('track','PageView');`}
        </Script>
      ) : null}
      {pixels.googleTagId ? (
        <>
          <Script
            id="foode-gtag-src"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(pixels.googleTagId)}`}
            strategy="afterInteractive"
          />
          <Script id="foode-gtag" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(pixels.googleTagId)}${googleConfig});`}
          </Script>
        </>
      ) : null}
    </>
  );
}
