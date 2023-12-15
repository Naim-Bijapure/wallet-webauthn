import { ethers } from "hardhat";
import { WebAuthn, EllipticCurve, WalletFactory, Wallet, webauthn } from "../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import * as _crypto from "crypto";
const crypto = _crypto.webcrypto;
import { GenerateRegistrationOptionsOpts, generateRegistrationOptions } from "@simplewebauthn/server";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
// import { WebAuthnAbortService, startRegistration } from "@simplewebauthn/browser";

const result = {
  pubKey:
    "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEybcDzlozQCk8AdqO-Gq28wtK3IszK-F8x_6p_T5ZUlIHE8LEI1-mhjuwozijwThwqRGRk-OX536NMkp8uQ5Eog",
  signature: "MEYCIQDbqtjJ110Jw-qzEwA4FUR_rTD_kidTvLboah8QRJIwOQIhAL_Srj4SLJ1c3N3jVLze8K5dceWKFaHYZcGl-ifM8tYZ",
  authenticatorData: "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAABA",
  clientData:
    "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiRGRiZGNSWWZnMkVHV1VQTnlFUHdpLWpnR01mRlRPT29fQzRoQ1IwZ2VIRSIsIm9yaWdpbiI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMCIsImNyb3NzT3JpZ2luIjpmYWxzZX0",
  clientChallenge: "DdbdcRYfg2EGWUPNyEPwi-jgGMfFTOOo_C4hCR0geHE",
};

describe("Webauthn", function () {
  function derToRS(der) {
    let offset = 3;
    let dataOffset;

    if (der[offset] == 0x21) {
      dataOffset = offset + 2;
    } else {
      dataOffset = offset + 1;
    }
    const r = der.slice(dataOffset, dataOffset + 32);
    offset = offset + der[offset] + 1 + 1;
    if (der[offset] == 0x21) {
      dataOffset = offset + 2;
    } else {
      dataOffset = offset + 1;
    }
    const s = der.slice(dataOffset, dataOffset + 32);
    return [r, s];
  }

  function bufferFromBase64(value) {
    return Buffer.from(value, "base64");
  }
  function bufferToHex(buffer) {
    return "0x".concat([...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join(""));
  }

  async function getKey(pubkey) {
    const algoParams = {
      name: "ECDSA",
      namedCurve: "P-256",
      hash: "SHA-256",
    };
    return await crypto.subtle.importKey("spki", pubkey, algoParams, true, ["verify"]);
  }

  async function deploy() {
    const pubKeyBuffer = bufferFromBase64(result.pubKey);
    const rawPubkey = await crypto.subtle.exportKey("jwk", await getKey(pubKeyBuffer));
    const { x, y } = rawPubkey;
    const pubkeyUintArray = [
      ethers.BigNumber.from(bufferToHex(bufferFromBase64(x))),
      ethers.BigNumber.from(bufferToHex(bufferFromBase64(y))),
    ];

    const EllipticCurve2 = await ethers.getContractFactory("EllipticCurve");
    const ellipticCurve2 = (await EllipticCurve2.deploy()) as EllipticCurve;
    console.log(`n-🔴 => deploy => ellipticCurve2.address:`, ellipticCurve2.address);

    const Webauthn = await ethers.getContractFactory("WebAuthn", {
      //       libraries: { EllipticCurve2: ellipticCurve2.address },
    });
    const webauthn = (await Webauthn.deploy()) as WebAuthn;
    console.log(`n-🔴 => deploy => webauthn:`, webauthn.address);

    return { webauthn, pubkeyUintArray };
  }

  async function getPublicKeyCoordinates(pubkey: string | undefined): Promise<BigNumber[]> {
    const pubKeyBuffer = bufferFromBase64(pubkey as string);
    const rawPubkey = await crypto.subtle.exportKey("jwk", await getKey(pubKeyBuffer));
    const { x, y } = rawPubkey;
    const pubkeyUintArray = [
      BigNumber.from(bufferToHex(bufferFromBase64(x as string))),
      BigNumber.from(bufferToHex(bufferFromBase64(y as string))),
    ];

    return pubkeyUintArray;
  }
  async function getSig(
    _signatureBase64: string,
    _authenticatorData: string,
    _clientData: string,
    _clientChallenge: string,
  ): Promise<ethers.BytesLike> {
    const signatureBuffer = bufferFromBase64(_signatureBase64);
    const signatureParsed = derToRS(signatureBuffer);

    const sig: ethers.BigNumber[] = [
      ethers.BigNumber.from(bufferToHex(signatureParsed[0])),
      ethers.BigNumber.from(bufferToHex(signatureParsed[1])),
    ];

    const authenticatorData = bufferFromBase64(_authenticatorData);
    const clientData = bufferFromBase64(_clientData);
    const challengeOffset = clientData.indexOf("226368616c6c656e6765223a", 0, "hex") + 12 + 1;

    const abiCoder = new ethers.utils.AbiCoder();
    const signature = abiCoder.encode(
      ["bytes", "bytes1", "bytes", "string", "uint", "uint[2]"],
      [authenticatorData, 0x01, clientData, _clientChallenge, challengeOffset, sig],
    );

    return ethers.utils.arrayify(signature);
  }

  let WebAuthNContract: WebAuthn;
  let walletFactory: WalletFactory;
  before(async () => {
    const [owner] = await ethers.getSigners();
    const webauthnContractFactory = await ethers.getContractFactory("WebAuthn");
    const WalletFactory = await ethers.getContractFactory("WalletFactory");
    WebAuthNContract = (await webauthnContractFactory.deploy()) as WebAuthn;
    walletFactory = (await WalletFactory.deploy(WebAuthNContract.address)) as WalletFactory;
  });

  describe("Deployment", function () {
    it("Verify the webauth sig", async function () {
      // const { webauthn, pubkeyUintArray } = await loadFixture(deploy);
      // const signature = bufferFromBase64(InputBase64.signature);
      // const signatureParsed = derToRS(signature);
      // const sig = [
      //   ethers.BigNumber.from(bufferToHex(signatureParsed[0])),
      //   ethers.BigNumber.from(bufferToHex(signatureParsed[1])),
      // ];
      // const authenticatorData = bufferFromBase64(InputBase64.authenticatorData);
      // const clientData = bufferFromBase64(InputBase64.clientData);
      // const challengeOffset = clientData.indexOf("226368616c6c656e6765223a", 0, "hex") + 12 + 1;
      // const result = await webauthn.validate(
      //   authenticatorData,
      //   0x05,
      //   clientData,
      //   InputBase64.clientChallenge,
      //   challengeOffset,
      //   sig,
      //   pubkeyUintArray,
      // );
      // console.log(`n-🔴 => result:`, result);
      // expect(result);
    });

    it("deploy wallet with wallet factory", async function () {
      const [owner] = await ethers.getSigners();
      console.log(`n-🔴 => owner:`, (await owner.getBalance()).toString());
      // console.log(`n-🔴 => walletFactory:`, walletFactory.address);
      const publicKeyCoordinate = await getPublicKeyCoordinates(result.pubKey);
      console.log(`n-🔴 => publicKeyCoordinate:`, publicKeyCoordinate);
      const deployWalletTx = await walletFactory.deploy("test", publicKeyCoordinate as any, {
        value: ethers.utils.parseEther("1"),
        gasLimit: 999999,
      });
      const deployWalletRcpt = await deployWalletTx.wait();

      const userWallet = await walletFactory.userWallets(owner.address);
      const WALLET = await ethers.getContractFactory("Wallet");

      const wallet: Wallet = new ethers.Contract(userWallet, WALLET.interface, owner) as any;
      // console.log(`n-🔴 => owner:`, owner.address);

      let walletBalance = await wallet.getBalance();
      // console.log(`n-🔴 => walletBalance:`, walletBalance);

      const ownerBalance = await owner.getBalance();
      // console.log(`n-🔴 => ownerBalance:`, ethers.utils.formatEther(ownerBalance.toString()));
      const sendTx = await owner.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther("11") });
      const sendRcpt = await sendTx.wait();

      walletBalance = await wallet.getBalance();
      // console.log(`n-🔴 => walletBalance:`, ethers.utils.formatEther(walletBalance.toString()));

      const dataSignature: ethers.BytesLike = await getSig(
        result?.signature as string,
        result?.authenticatorData as string,
        result?.clientData as string,
        result.clientChallenge as string,
      );

      // const signature = bufferFromBase64(result.signature);
      // const signatureParsed = derToRS(signature);
      // const sig = [
      //   ethers.BigNumber.from(bufferToHex(signatureParsed[0])),
      //   ethers.BigNumber.from(bufferToHex(signatureParsed[1])),
      // ];
      // const authenticatorData = bufferFromBase64(result.authenticatorData);
      // const clientData = bufferFromBase64(result.clientData);
      // const challengeOffset = clientData.indexOf("226368616c6c656e6765223a", 0, "hex") + 12 + 1;

      // const data = await WebAuthNContract.validate(
      //   authenticatorData,
      //   0x05,
      //   clientData,
      //   result.clientChallenge,
      //   challengeOffset,
      //   sig,
      //   publicKeyCoordinate,
      // );
      // console.log(`n-🔴 => data:`, data);

      // const walletSendTx = await wallet.send(owner.address, ethers.utils.parseEther("1"), dataSignature);
      // const walletSendRcpt = await walletSendTx.wait();

      // const clientChallenge = await WebAuthNContract.getChallenge(dataSignature);
      // console.log(`n-🔴 => clientChallenge:`, clientChallenge);

      const isValidateSignatureTx = await wallet.isValidSignature(dataSignature);
      console.log(`n-🔴 => isValidateSignatureTx:`, isValidateSignatureTx);

      // walletBalance = await wallet.getBalance();
      // console.log(`n-🔴 => walletBalance:`, ethers.utils.formatEther(walletBalance.toString()));
    });
  });
});
