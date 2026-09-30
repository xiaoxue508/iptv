include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-iptvd
PKG_VERSION:=0.1.0
PKG_RELEASE:=2

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-iptvd
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=IPTV control-plane (iptvd) status dashboard
  DEPENDS:=+iptvd +rpcd
  PKGARCH:=all
endef

define Package/luci-app-iptvd/description
  LuCI control panel for iptvd: status dashboard with alerts, log tail and
  action buttons (relogin/refresh/EPG rebuild/restart), account & upstream
  interface forms, TTL settings and a raw config editor, backed by a rpcd
  exec plugin exposing ubus object "iptvd".
endef

define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-iptvd/install
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) $(CURDIR)/files/menu.d/luci-app-iptvd.json \
		$(1)/usr/share/luci/menu.d/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) $(CURDIR)/files/acl.d/luci-app-iptvd.json \
		$(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) $(CURDIR)/files/rpcd/iptvd $(1)/usr/libexec/rpcd/iptvd
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/iptvd
	$(INSTALL_DATA) $(CURDIR)/files/view/iptvd/status.js \
		$(1)/www/luci-static/resources/view/iptvd/
endef

$(eval $(call BuildPackage,luci-app-iptvd))
