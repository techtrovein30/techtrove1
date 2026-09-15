import { Fragment } from "react";
import { siteConfig } from "../../data/techtrove";

export function Marquee() {
  const items = siteConfig.marqueeItems;
  const sequence = (ariaHidden: boolean) => (
    <div aria-hidden={ariaHidden} className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <Fragment key={`${item}-${i}`}>
          <span className="display mx-8 whitespace-nowrap text-xl text-foreground/90 md:text-2xl">
            {item}
          </span>
          <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-primary" />
        </Fragment>
      ))}
    </div>
  );

  return (
    <section aria-label="Symposium highlights" className="overflow-hidden border-y border-edge bg-surface py-4">
      <div className="marquee-track">
        {sequence(false)}
        {sequence(true)}
        {sequence(true)}
      </div>
    </section>
  );
}
