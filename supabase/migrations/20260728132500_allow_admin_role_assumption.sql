-- A credencial postgres continua restrita a migrations, seed, fixtures e
-- operações administrativas conscientes. O grant permite que esses fluxos
-- reduzam privilégios explicitamente antes de provar as policies de negócio.
GRANT foode_business TO postgres;
