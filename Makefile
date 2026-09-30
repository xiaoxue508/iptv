include $(TOPDIR)/rules.mk

PKG_NAME:=iptvd
PKG_VERSION:=0.1.0
PKG_RELEASE:=3

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/iptvd
  SECTION:=net
  CATEGORY:=Network
  TITLE:=IPTV control-plane daemon (EPG / catchup / playlist)
  DEPENDS:=+libcurl
endef

define Package/iptvd/description
  Standalone C port of the NAS-side IPTV control plane:
  EPG login/session, channel table, programs, TVOD catchup URLs,
  XMLTV EPG, M3U playlists and a /status JSON endpoint.
endef

define Package/iptvd/conffiles
/etc/iptvd.conf
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) $(CURDIR)/src/* $(PKG_BUILD_DIR)/
endef

define Build/Compile
	$(MAKE) -C $(PKG_BUILD_DIR) \
		CC="$(TARGET_CC)" \
		CFLAGS="$(TARGET_CFLAGS) -std=gnu99 -Wall" \
		LDFLAGS="$(TARGET_LDFLAGS)" \
		LDLIBS="-lcurl -lpthread"
endef

define Package/iptvd/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/iptvd $(1)/usr/sbin/iptvd
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(CURDIR)/files/iptvd.init $(1)/etc/init.d/iptvd
	$(INSTALL_DIR) $(1)/etc
	$(INSTALL_CONF) $(CURDIR)/files/iptvd.conf $(1)/etc/iptvd.conf
endef

$(eval $(call BuildPackage,iptvd))
