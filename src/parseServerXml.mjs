/*
 *
 * Helper: `parseServerXml`.
 *
 */
// Not a general-purpose XML parser - this only understands the one Tomcat
// convention seen in practice: a single active (uncommented) Connector and
// Host per server.xml, one Tomcat instance per install directory. Strips
// comments first so the several commented-out alternative Connector blocks
// Tomcat ships by default don't get matched instead of the real one.
const stripXmlComments = (content) => content.replace(/<!--[\s\S]*?-->/g, "");

const parseServerXml = (content) => {
  const withoutComments = stripXmlComments(content);

  const portMatch = withoutComments.match(/<Connector\b[^>]*\bport="(\d+)"/);
  const appBaseMatch = withoutComments.match(/<Host\b[^>]*\bappBase="([^"]+)"/);

  if (!portMatch || !appBaseMatch) return null;

  return { port: portMatch[1], appBase: appBaseMatch[1] };
};

export default parseServerXml;
