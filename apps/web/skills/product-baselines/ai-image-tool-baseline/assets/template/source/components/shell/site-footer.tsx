import type { TemplateDictionary } from "../../lib/i18n";
import { site } from "../../content/site";
import { footerNavigation, sharedShell } from "../../content/navigation";

type SiteFooterProps = {
  dictionary: TemplateDictionary;
};

export function SiteFooter({ dictionary }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div className="site-footer__brand">
          <span className="brand-mark">{site.name}</span>
          <p>{sharedShell.sourceTemplate} {dictionary.footerPreparedBy}</p>
        </div>
        <nav className="site-nav" aria-label="Footer">
          {footerNavigation.map((item) => (
            <a key={item.href} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined} className="footer-link">
              {item.title}
            </a>
          ))}
        </nav>
      </div>
      <div className="site-footer__bottom">
        <p className="site-footer__copyright">© 2026 {site.name}. Powered by Krea FLUX.1.</p>
      </div>
    </footer>
  );
}
