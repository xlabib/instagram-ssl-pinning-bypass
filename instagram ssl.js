'use strict';

var isTigonMNSServiceHolderHooked = false;

function hookLibLoading() {
    Java.perform(() => {
        try {
            const systemClass = Java.use("com.facebook.soloader.MergedSoMapping$Invoke_JNI_OnLoad");
            systemClass.libappstatelogger2_so.implementation = function () {
                if (!isTigonMNSServiceHolderHooked) {
                    isTigonMNSServiceHolderHooked = true;
                    hookTigonMNSServiceHolderSmart();
                }
                return this.libappstatelogger2_so();
            };
        } catch (e) {
            logger("Failed to hook libappstatelogger2_so: " + e);
        }
    });
}

function hookTigonMNSServiceHolderSmart() {
    Java.perform(() => {
        try {
            const clazz = Java.use("com.facebook.tigon.tigonmns.TigonMNSServiceHolder");
            const overloads = clazz.initHybrid.overloads;

            logger("Searching for initHybrid overloads...");

            overloads.forEach(o => {
                const args = o.argumentTypes.map(a => a.className);
                logger("     Overload: (" + args.join(", ") + ")");
                if (args.length >= 3 && args[0].includes("TigonMNSConfig") && args[2].includes("HucClient")) {
                    o.implementation = function () {
                        try {
                            var cfg = arguments[0];
                            cfg.setEnableCertificateVerificationWithProofOfPossession(false);
                            cfg.setTrustSandboxCertificates(true);
                            cfg.setForceHttp2(true);
                            logger("SSL verification disabled via Smart Hook for this overload");
                        } catch (inner) {
                            logger("Failed to patch TigonMNSConfig: " + inner);
                        }
                        return o.call(this, ...arguments);
                    };
                    logger("Smart hook applied to initHybrid overload automatically");
                } else {
                    logger("Detected unmatched initHybrid overload: (" + args.join(", ") + ")");
                }
            });

        } catch (e) {
            logger("Smart hook failed: " + e);
        }
    });
}

function logger(message) {
    console.log(message);
}
hookLibLoading();
Java.perform(() => {
    try {
        const array_list = Java.use("java.util.ArrayList");
        const TrustManagerImpl = Java.use("com.android.org.conscrypt.TrustManagerImpl");
        if (TrustManagerImpl.checkTrustedRecursive) {
            TrustManagerImpl.checkTrustedRecursive.implementation = function () {
                return array_list.$new();
            };
            logger("Hooked checkTrustedRecursive");
        } else {
            logger("checkTrustedRecursive not found");
        }
    } catch (e) {
        logger("Failed to hook checkTrustedRecursive: " + e);
    }
});

// Global SSLContext override
Java.perform(() => {
    try {
        const X509TrustManager = Java.use("javax.net.ssl.X509TrustManager");
        const SSLContext = Java.use("javax.net.ssl.SSLContext");

        const TrustManager = Java.registerClass({
            name: "com.leftenter.instagram.TrustManager",
            implements: [X509TrustManager],
            methods: {
                checkClientTrusted: function (chain, authType) { },
                checkServerTrusted: function (chain, authType) { },
                getAcceptedIssuers: function () { return []; },
            }
        });

        const TrustManagers = [TrustManager.$new()];

        const SSLContextInit = SSLContext.init.overload(
            "[Ljavax.net.ssl.KeyManager;", "[Ljavax.net.ssl.TrustManager;", "java.security.SecureRandom"
        );

        SSLContextInit.implementation = function (km, tm, sr) {
            SSLContextInit.call(this, km, TrustManagers, sr);
            logger("SSLContext.init overridden globally");
        };
    } catch (e) {
        logger("Failed to override SSLContext: " + e);
    }
});
