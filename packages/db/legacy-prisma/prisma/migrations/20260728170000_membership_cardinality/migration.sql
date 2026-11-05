-- Uma identidade pode aparecer em mais de uma Loja no schema. Enquanto o MVP
-- não possuir seleção explícita de Loja, a API rejeita memberships ambíguas.
DROP INDEX "store_members_user_id_key";
